# Brew & Bean Coffee Shop Server with Secure Supabase Auth & MCP Proxy Integration
$port = 8080
$path = $PSScriptRoot
if (-not $path) { $path = (Get-Location).Path }

# Load environment variables securely from .env file
$envFile = Join-Path $path ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#')) {
            $parts = $line.Split('=', 2)
            if ($parts.Count -eq 2) {
                [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), [System.EnvironmentVariableTarget]::Process)
            }
        }
    }
}

function Get-Sha256Hash($text) {
    if ([string]::IsNullOrEmpty($text)) { return "" }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha.ComputeHash($bytes)
    return [System.BitConverter]::ToString($hashBytes).Replace('-', '').ToLower()
}

function Invoke-McpProxy {
    param(
        [System.Net.HttpListenerContext]$context
    )
    $request = $context.Request
    $response = $context.Response

    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        return
    }

    $token = [System.Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN")
    $mcpUrl = [System.Environment]::GetEnvironmentVariable("MCP_SERVER_URL")
    if (-not $mcpUrl) { $mcpUrl = "https://mcp.supabase.com/mcp" }

    if ([string]::IsNullOrWhiteSpace($token)) {
        $response.StatusCode = 500
        $response.ContentType = "application/json; charset=utf-8"
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"jsonrpc":"2.0","error":{"code":-32603,"message":"MCP authentication token not configured"},"id":null}')
        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        $response.Close()
        return
    }

    try {
        $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
        $bodyText = $reader.ReadToEnd()
        $reader.Close()

        if ([string]::IsNullOrWhiteSpace($bodyText)) {
            $bodyText = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"brew-and-bean","version":"1.0.0"}},"id":1}'
        }

        $tmpFile = [System.IO.Path]::GetTempFileName()
        [System.IO.File]::WriteAllText($tmpFile, $bodyText, [System.Text.Encoding]::UTF8)

        $authHeader = "Authorization: Bearer $token"
        $curlOutput = & curl.exe -s -X POST $mcpUrl -H "Content-Type: application/json" -H $authHeader -H "Accept: application/json, text/event-stream" --data-binary "@$tmpFile"

        if (Test-Path $tmpFile) { Remove-Item $tmpFile -ErrorAction SilentlyContinue }

        if (-not $curlOutput) {
            $curlOutput = '{"jsonrpc":"2.0","error":{"code":-32000,"message":"MCP server returned empty response"},"id":null}'
        }

        $response.StatusCode = 200
        $response.ContentType = "application/json; charset=utf-8"
        $respBytes = [System.Text.Encoding]::UTF8.GetBytes($curlOutput)
        $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
    } catch {
        $response.StatusCode = 502
        $response.ContentType = "application/json; charset=utf-8"
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"jsonrpc":"2.0","error":{"code":-32000,"message":"MCP server unavailable or authentication failed"},"id":null}')
        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
    } finally {
        $response.Close()
    }
}

function Invoke-AuthApi {
    param(
        [System.Net.HttpListenerContext]$context,
        [string]$subPath
    )
    $request = $context.Request
    $response = $context.Response

    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        return
    }

    $supabaseUrl = [System.Environment]::GetEnvironmentVariable("SUPABASE_URL")
    $supabaseAnonKey = [System.Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY")
    if (-not $supabaseUrl) { $supabaseUrl = "https://tgrbmkrjkaflhzysobdy.supabase.co" }

    $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
    $bodyText = $reader.ReadToEnd()
    $reader.Close()

    $data = @{}
    if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
        try {
            $data = $bodyText | ConvertFrom-Json
        } catch {}
    }

    $headers = @{
        "apikey" = $supabaseAnonKey
        "Authorization" = "Bearer $supabaseAnonKey"
    }

    # 1. SIGN UP (Supabase Auth + Profile Creation)
    if ($subPath -eq "signup") {
        $name = $data.name
        $email = $data.email
        $phone = $data.phone
        $password = $data.password

        if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Email and password are required."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }

        # Sign Up via Supabase Auth Endpoint (/auth/v1/signup)
        $signUpBody = @{
            email = $email
            password = $password
            data = @{
                full_name = $name
                phone = $phone
            }
        } | ConvertTo-Json

        try {
            $authResult = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/signup" -Headers $headers -Method Post -Body $signUpBody -ContentType "application/json" -ErrorAction Stop
            
            $userId = $authResult.id
            if (-not $userId -and $authResult.user) { $userId = $authResult.user.id }

            # Create or update profile record in public.profiles table
            if ($userId) {
                $profileBody = @{
                    id = $userId
                    full_name = $name
                    email = $email
                    phone = $phone
                } | ConvertTo-Json

                $profileHeaders = @{
                    "apikey" = $supabaseAnonKey
                    "Authorization" = "Bearer $supabaseAnonKey"
                    "Prefer" = "resolution=merge-duplicates"
                }

                try {
                    Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/profiles" -Headers $profileHeaders -Method Post -Body $profileBody -ContentType "application/json" -ErrorAction SilentlyContinue
                } catch {}
            }

            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respJson = @{
                success = $true
                message = "Account created and saved to Supabase successfully"
                user = @{
                    id = $userId
                    name = $name
                    email = $email
                    phone = $phone
                    memberSince = "2026"
                    discountUnlocked = $true
                }
                session = @{
                    access_token = $authResult.access_token
                    refresh_token = $authResult.refresh_token
                }
            } | ConvertTo-Json
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.Close()
            return
        } catch {
            $errMsg = "An account with this email address already exists or registration failed."
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errJson = @{ error = $errMsg } | ConvertTo-Json
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }
    }

    # 2. LOGIN (Supabase Auth + Profile Retrieval)
    if ($subPath -eq "login") {
        $email = $data.email
        $password = $data.password

        if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Email and password are required."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }

        # Login via Supabase Auth Password Grant (/auth/v1/token?grant_type=password)
        $loginBody = @{
            email = $email
            password = $password
        } | ConvertTo-Json

        try {
            $authResult = Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers $headers -Method Post -Body $loginBody -ContentType "application/json" -ErrorAction Stop
            
            $userId = $authResult.user.id
            $accessToken = $authResult.access_token

            # Fetch profile record from public.profiles using access_token (testing RLS compliance)
            $userFullName = $authResult.user.user_metadata.full_name
            $userPhone = $authResult.user.user_metadata.phone

            if ($accessToken) {
                $userHeaders = @{
                    "apikey" = $supabaseAnonKey
                    "Authorization" = "Bearer $accessToken"
                }
                try {
                    $profiles = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/profiles?id=eq.$userId" -Headers $userHeaders -Method Get -ErrorAction SilentlyContinue
                    if ($profiles -and $profiles.Count -gt 0) {
                        if ($profiles[0].full_name) { $userFullName = $profiles[0].full_name }
                        if ($profiles[0].phone) { $userPhone = $profiles[0].phone }
                    }
                } catch {}
            }

            if (-not $userFullName) {
                $userName = $email.Split('@')[0]
                $userFullName = $userName.Substring(0,1).ToUpper() + $userName.Substring(1)
            }

            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respJson = @{
                success = $true
                user = @{
                    id = $userId
                    name = $userFullName
                    email = $email
                    phone = $userPhone
                    memberSince = "2026"
                    discountUnlocked = $true
                }
                session = @{
                    access_token = $accessToken
                    refresh_token = $authResult.refresh_token
                }
            } | ConvertTo-Json
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.Close()
            return
        } catch {
            $response.StatusCode = 401
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Invalid email address or password."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }
    }

    # 3. FORGOT PASSWORD (Supabase Auth Recover)
    if ($subPath -eq "recover") {
        $email = $data.email
        if ([string]::IsNullOrWhiteSpace($email)) {
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Email address is required."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }

        $recoverBody = @{ email = $email } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/recover" -Headers $headers -Method Post -Body $recoverBody -ContentType "application/json" -ErrorAction SilentlyContinue
        } catch {}

        $response.StatusCode = 200
        $response.ContentType = "application/json; charset=utf-8"
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true,"message":"Password reset link sent to your email address."}')
        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        $response.Close()
        return
    }

    # 4. LOGOUT (Supabase Auth Revoke Session)
    if ($subPath -eq "logout") {
        $authAuthHeader = $request.Headers["Authorization"]
        if ($authAuthHeader) {
            $userHeaders = @{
                "apikey" = $supabaseAnonKey
                "Authorization" = $authAuthHeader
            }
            try {
                Invoke-RestMethod -Uri "$supabaseUrl/auth/v1/logout" -Headers $userHeaders -Method Post -ErrorAction SilentlyContinue
            } catch {}
        }

        $response.StatusCode = 200
        $response.ContentType = "application/json; charset=utf-8"
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success":true}')
        $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        $response.Close()
        return
    }

    # 5. GET PROFILE (Supabase RLS Protected Profile Fetch)
    if ($subPath -eq "profile") {
        $authAuthHeader = $request.Headers["Authorization"]
        if (-not $authAuthHeader) {
            $response.StatusCode = 401
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Unauthorized"}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }

        $userHeaders = @{
            "apikey" = $supabaseAnonKey
            "Authorization" = $authAuthHeader
        }

        try {
            $profile = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/profiles" -Headers $userHeaders -Method Get -ErrorAction Stop
            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respJson = @{ success = $true; profile = $profile } | ConvertTo-Json
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.Close()
            return
        } catch {
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Failed to fetch profile."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }
    }
}

function Invoke-OrdersApi {
    param(
        [System.Net.HttpListenerContext]$context,
        [string]$subPath
    )
    $request = $context.Request
    $response = $context.Response

    $response.AddHeader("Access-Control-Allow-Origin", "*")
    $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    $response.AddHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")

    if ($request.HttpMethod -eq "OPTIONS") {
        $response.StatusCode = 200
        $response.Close()
        return
    }

    $supabaseUrl = [System.Environment]::GetEnvironmentVariable("SUPABASE_URL")
    $supabaseAnonKey = [System.Environment]::GetEnvironmentVariable("SUPABASE_ANON_KEY")
    if (-not $supabaseUrl) { $supabaseUrl = "https://tgrbmkrjkaflhzysobdy.supabase.co" }

    $authAuthHeader = $request.Headers["Authorization"]

    # 1. CREATE ORDER (/api/orders/create)
    if ($subPath -eq "create") {
        $reader = New-Object System.IO.StreamReader($request.InputStream, $request.ContentEncoding)
        $bodyText = $reader.ReadToEnd()
        $reader.Close()

        $data = @{}
        if (-not [string]::IsNullOrWhiteSpace($bodyText)) {
            try { $data = $bodyText | ConvertFrom-Json } catch {}
        }

        $orderNumber = $data.order_number
        $userId = $data.user_id
        $items = $data.items
        $subtotal = $data.subtotal
        $tax = $data.tax
        $totalAmount = $data.total_amount
        $status = $data.status
        if (-not $status) { $status = "Completed" }

        $orderPayload = @{
            order_number = $orderNumber
            items = $items
            subtotal = $subtotal
            tax = $tax
            total_amount = $totalAmount
            status = $status
        }
        if ($userId) {
            $orderPayload["user_id"] = $userId
        }

        $orderJson = $orderPayload | ConvertTo-Json -Depth 5

        $reqHeaders = @{
            "apikey" = $supabaseAnonKey
            "Authorization" = if ($authAuthHeader) { $authAuthHeader } else { "Bearer $supabaseAnonKey" }
            "Prefer" = "return=representation"
        }

        try {
            $createdOrder = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/orders" -Headers $reqHeaders -Method Post -Body $orderJson -ContentType "application/json" -ErrorAction Stop
            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respJson = @{ success = $true; order = $createdOrder } | ConvertTo-Json -Depth 5
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.Close()
            return
        } catch {
            $errMsg = $_.Exception.Message
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errJson = @{ error = "Failed to save order to database."; details = $errMsg } | ConvertTo-Json
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }
    }

    # 2. LIST ORDERS (/api/orders/list)
    if ($subPath -eq "list") {
        $userId = $request.QueryString["user_id"]

        $reqHeaders = @{
            "apikey" = $supabaseAnonKey
            "Authorization" = if ($authAuthHeader) { $authAuthHeader } else { "Bearer $supabaseAnonKey" }
        }

        $fetchUri = "$supabaseUrl/rest/v1/orders?order=created_at.desc"
        if ($userId) {
            $fetchUri = "$supabaseUrl/rest/v1/orders?user_id=eq.$userId&order=created_at.desc"
        }

        try {
            $orders = Invoke-RestMethod -Uri $fetchUri -Headers $reqHeaders -Method Get -ErrorAction Stop
            $response.StatusCode = 200
            $response.ContentType = "application/json; charset=utf-8"
            $respJson = @{ success = $true; orders = $orders } | ConvertTo-Json -Depth 5
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes($respJson)
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.Close()
            return
        } catch {
            $response.StatusCode = 400
            $response.ContentType = "application/json; charset=utf-8"
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes('{"error":"Failed to fetch order history."}')
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            $response.Close()
            return
        }
    }
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "Brew & Bean server successfully started at: $prefix"
} catch {
    # Fallback to port 3000 if 8080 is in use
    $port = 3000
    $prefix = "http://localhost:$port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    Write-Host "Brew & Bean server successfully started at: $prefix"
}

$mimeTypes = @{
    ".html"  = "text/html; charset=utf-8"
    ".css"   = "text/css; charset=utf-8"
    ".js"    = "application/javascript; charset=utf-8"
    ".json"  = "application/json; charset=utf-8"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".gif"   = "image/gif"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".webp"  = "image/webp"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "index.html"
        }

        # Check for MCP API Proxy Endpoint
        if ($urlPath -eq "api/mcp" -or $urlPath -eq "api/mcp/") {
            Invoke-McpProxy -context $context
            continue
        }

        # Check for Supabase Auth Endpoints
        if ($urlPath.StartsWith("api/auth/")) {
            $subPath = $urlPath.Substring("api/auth/".Length).TrimEnd('/')
            Invoke-AuthApi -context $context -subPath $subPath
            continue
        }

        # Check for Supabase Order Endpoints
        if ($urlPath.StartsWith("api/orders/")) {
            $subPath = $urlPath.Substring("api/orders/".Length).TrimEnd('/')
            Invoke-OrdersApi -context $context -subPath $subPath
            continue
        }

        $urlPath = [System.Uri]::UnescapeDataString($urlPath)
        $localFilePath = Join-Path $path $urlPath

        if (Test-Path -Path $localFilePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localFilePath).ToLower()
            $contentType = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $contentType = $mimeTypes[$ext]
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($localFilePath)
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }
        $response.Close()
    } catch {
        # Continue on client abort
    }
}
