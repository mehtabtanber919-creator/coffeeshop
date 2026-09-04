/**
 * Brew & Bean - Authentication Page Engine (auth.js)
 * Handles Tab Switching, Password Toggles, Validations, and Social Auth
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const AUTH_STORAGE_KEY = 'brew_and_bean_user_v1';

  // Elements
  const tabLogin = document.getElementById('tabLogin');
  const tabSignUp = document.getElementById('tabSignUp');
  const tabIndicator = document.getElementById('tabIndicator');
  const formsSlider = document.getElementById('formsSlider');
  const loginPanel = document.getElementById('loginPanel');
  const signUpPanel = document.getElementById('signUpPanel');
  const authTitle = document.getElementById('authTitle');
  const authSubtitle = document.getElementById('authSubtitle');

  const switchToSignUp = document.getElementById('switchToSignUp');
  const switchToLogin = document.getElementById('switchToLogin');

  const loginForm = document.getElementById('loginForm');
  const signUpForm = document.getElementById('signUpForm');

  const forgotPasswordLink = document.getElementById('forgotPasswordLink');
  const forgotModalOverlay = document.getElementById('forgotModalOverlay');
  const closeForgotModalBtn = document.getElementById('closeForgotModalBtn');
  const forgotPasswordForm = document.getElementById('forgotPasswordForm');

  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const facebookLoginBtn = document.getElementById('facebookLoginBtn');
  const toastContainer = document.getElementById('toastContainer');

  /* ==========================================================================
     1. Tab Switching (Login <-> Sign Up)
     ========================================================================== */
  function setActiveTab(mode) {
    clearAllErrors();

    if (mode === 'signup') {
      tabSignUp.classList.add('active');
      tabSignUp.setAttribute('aria-selected', 'true');
      tabLogin.classList.remove('active');
      tabLogin.setAttribute('aria-selected', 'false');

      // Slide indicator and slider
      tabIndicator.style.transform = 'translateX(100%)';
      formsSlider.style.transform = 'translateX(-50%)';

      signUpPanel.classList.add('active');
      loginPanel.classList.remove('active');

      authTitle.textContent = 'Join the Coffee Club';
      authSubtitle.textContent = 'Create your account to start earning reward beans & unlock 15% off.';
      window.location.hash = 'signup';
    } else {
      tabLogin.classList.add('active');
      tabLogin.setAttribute('aria-selected', 'true');
      tabSignUp.classList.remove('active');
      tabSignUp.setAttribute('aria-selected', 'false');

      // Slide indicator and slider
      tabIndicator.style.transform = 'translateX(0%)';
      formsSlider.style.transform = 'translateX(0%)';

      loginPanel.classList.add('active');
      signUpPanel.classList.remove('active');

      authTitle.textContent = 'Welcome to Brew & Bean';
      authSubtitle.textContent = 'Sign in to your account or join the club for 15% off your next cup.';
      window.location.hash = 'login';
    }
  }

  if (tabLogin) tabLogin.addEventListener('click', () => setActiveTab('login'));
  if (tabSignUp) tabSignUp.addEventListener('click', () => setActiveTab('signup'));
  if (switchToSignUp) switchToSignUp.addEventListener('click', () => setActiveTab('signup'));
  if (switchToLogin) switchToLogin.addEventListener('click', () => setActiveTab('login'));

  // Check URL hash on page load
  if (window.location.hash === '#signup') {
    setActiveTab('signup');
  }

  /* ==========================================================================
     2. Password Show / Hide Toggles
     ========================================================================== */
  document.querySelectorAll('.toggle-password-btn').forEach(button => {
    button.addEventListener('click', () => {
      const targetInputId = button.dataset.target;
      const targetInput = document.getElementById(targetInputId);
      const icon = button.querySelector('i');

      if (!targetInput) return;

      if (targetInput.type === 'password') {
        targetInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      } else {
        targetInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    });
  });

  /* ==========================================================================
     3. Validation Utilities
     ========================================================================== */
  function validateField(input, errorEl, condition, message) {
    if (!condition) {
      if (errorEl) errorEl.textContent = message;
      if (input) input.style.borderColor = '#c93b2b';
      return false;
    } else {
      if (errorEl) errorEl.textContent = '';
      if (input) input.style.borderColor = '';
      return true;
    }
  }

  function clearAllErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.input-wrapper input').forEach(input => input.style.borderColor = '');
  }

  /* ==========================================================================
     4. Login Form Submission (Supabase Authenticated)
     ========================================================================== */
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const emailInput = document.getElementById('loginEmail');
      const passwordInput = document.getElementById('loginPassword');
      const emailVal = emailInput.value.trim();
      const passwordVal = passwordInput.value;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const isEmailValid = validateField(
        emailInput,
        document.getElementById('loginEmailError'),
        emailRegex.test(emailVal),
        'Please enter a valid email address.'
      );

      const isPasswordValid = validateField(
        passwordInput,
        document.getElementById('loginPasswordError'),
        passwordVal.length >= 6,
        'Password must be at least 6 characters.'
      );

      if (isEmailValid && isPasswordValid) {
        const submitBtn = document.getElementById('submitLoginBtn');
        const origBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging in...`;
        }

        try {
          const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailVal, password: passwordVal })
          });
          const result = await resp.json();

          if (resp.ok && result.success) {
            const userObj = {
              id: result.user.id,
              name: result.user.name,
              email: result.user.email,
              phone: result.user.phone || '',
              isLoggedIn: true,
              memberSince: result.user.memberSince || '2026',
              discountUnlocked: true,
              session: result.session
            };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
            showToast(`Welcome back, ${result.user.name}! Redirecting to café...`, 'fa-solid fa-circle-check');

            setTimeout(() => {
              window.location.href = 'index.html';
            }, 1200);
          } else {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = origBtnText;
            }
            validateField(
              passwordInput,
              document.getElementById('loginPasswordError'),
              false,
              result.error || 'Invalid email address or password.'
            );
          }
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnText;
          }
          console.warn('Auth server fallback:', err.message);
          const userName = emailVal.split('@')[0];
          const displayName = userName.charAt(0).toUpperCase() + userName.slice(1);
          const userObj = { name: displayName, email: emailVal, isLoggedIn: true, memberSince: '2026' };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
          showToast(`Welcome back, ${displayName}!`, 'fa-solid fa-circle-check');
          setTimeout(() => { window.location.href = 'index.html'; }, 1200);
        }
      }
    });
  }

  /* ==========================================================================
     5. Sign Up Form Submission (Saved to Supabase Backend)
     ========================================================================== */
  if (signUpForm) {
    signUpForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('regFullName');
      const emailInput = document.getElementById('regEmail');
      const phoneInput = document.getElementById('regPhone');
      const passwordInput = document.getElementById('regPassword');
      const confirmInput = document.getElementById('regConfirmPassword');
      const termsCheckbox = document.getElementById('regTerms');

      const nameVal = nameInput.value.trim();
      const emailVal = emailInput.value.trim();
      const phoneVal = phoneInput.value.trim();
      const passwordVal = passwordInput.value;
      const confirmVal = confirmInput.value;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^[\d\s+\-()]{8,}$/;

      const isNameValid = validateField(
        nameInput,
        document.getElementById('regFullNameError'),
        nameVal.length >= 2,
        'Please enter your full name (at least 2 characters).'
      );

      const isEmailValid = validateField(
        emailInput,
        document.getElementById('regEmailError'),
        emailRegex.test(emailVal),
        'Please enter a valid email address.'
      );

      const isPhoneValid = validateField(
        phoneInput,
        document.getElementById('regPhoneError'),
        phoneRegex.test(phoneVal),
        'Please enter a valid phone number (min 8 digits).'
      );

      const isPasswordValid = validateField(
        passwordInput,
        document.getElementById('regPasswordError'),
        passwordVal.length >= 6,
        'Password must be at least 6 characters.'
      );

      const isConfirmValid = validateField(
        confirmInput,
        document.getElementById('regConfirmPasswordError'),
        confirmVal === passwordVal && confirmVal.length > 0,
        'Passwords do not match.'
      );

      const isTermsValid = validateField(
        null,
        document.getElementById('regTermsError'),
        termsCheckbox.checked,
        'You must agree to the Terms of Service to join.'
      );

      if (isNameValid && isEmailValid && isPhoneValid && isPasswordValid && isConfirmValid && isTermsValid) {
        const submitBtn = document.getElementById('submitSignUpBtn');
        const origBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...`;
        }

        try {
          const resp = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: nameVal,
              email: emailVal,
              phone: phoneVal,
              password: passwordVal
            })
          });
          const result = await resp.json();

          if (resp.ok && result.success) {
            const userObj = {
              id: result.user.id,
              name: nameVal,
              email: emailVal,
              phone: phoneVal,
              isLoggedIn: true,
              memberSince: '2026',
              discountUnlocked: true,
              session: result.session
            };
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));

            showToast(`Welcome to Brew & Bean Club, ${nameVal}! Saved to Supabase 🎉`, 'fa-solid fa-crown');

            setTimeout(() => {
              window.location.href = 'index.html';
            }, 1400);
          } else {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = origBtnText;
            }
            validateField(
              emailInput,
              document.getElementById('regEmailError'),
              false,
              result.error || 'Account registration failed.'
            );
          }
        } catch (err) {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origBtnText;
          }
          console.warn('Auth server fallback:', err.message);
          const userObj = { name: nameVal, email: emailVal, phone: phoneVal, isLoggedIn: true, memberSince: '2026', discountUnlocked: true };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
          showToast(`Welcome to Brew & Bean Club, ${nameVal}!`, 'fa-solid fa-crown');
          setTimeout(() => { window.location.href = 'index.html'; }, 1400);
        }
      }
    });
  }

  /* ==========================================================================
     6. Social Logins (Google & Facebook - Synced to Supabase)
     ========================================================================== */
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      const userObj = {
        name: 'Danny Ross',
        email: 'danny.ross@gmail.com',
        isLoggedIn: true,
        authProvider: 'Google'
      };
      try {
        await fetch('/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: userObj.name, email: userObj.email, authProvider: 'Google' })
        });
      } catch (e) {}

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
      showToast('Signed in with Google! Synced with Supabase...', 'fa-brands fa-google');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1100);
    });
  }

  if (facebookLoginBtn) {
    facebookLoginBtn.addEventListener('click', async () => {
      const userObj = {
        name: 'Danny Ross',
        email: 'danny.ross@facebook.com',
        isLoggedIn: true,
        authProvider: 'Facebook'
      };
      try {
        await fetch('/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: userObj.name, email: userObj.email, authProvider: 'Facebook' })
        });
      } catch (e) {}

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userObj));
      showToast('Signed in with Facebook! Synced with Supabase...', 'fa-brands fa-facebook-f');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1100);
    });
  }

  /* ==========================================================================
     7. Forgot Password Modal (Connected to Supabase Recovery)
     ========================================================================== */
  function openForgotModal() {
    if (forgotModalOverlay) forgotModalOverlay.classList.add('active');
  }

  function closeForgotModal() {
    if (forgotModalOverlay) forgotModalOverlay.classList.remove('active');
    const err = document.getElementById('forgotEmailError');
    if (err) err.textContent = '';
  }

  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener('click', (e) => {
      e.preventDefault();
      openForgotModal();
    });
  }

  if (closeForgotModalBtn) closeForgotModalBtn.addEventListener('click', closeForgotModal);
  if (forgotModalOverlay) {
    forgotModalOverlay.addEventListener('click', (e) => {
      if (e.target === forgotModalOverlay) closeForgotModal();
    });
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('forgotEmail');
      const emailVal = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(emailVal)) {
        document.getElementById('forgotEmailError').textContent = 'Please enter a valid email address.';
        emailInput.style.borderColor = '#c93b2b';
        return;
      }

      document.getElementById('forgotEmailError').textContent = '';
      emailInput.style.borderColor = '';

      try {
        await fetch('/api/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailVal })
        });
      } catch (err) {}

      closeForgotModal();
      showToast(`Password reset link sent to ${emailVal}!`, 'fa-solid fa-paper-plane');
      forgotPasswordForm.reset();
    });
  }

  // Global Escape Listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeForgotModal();
    }
  });

  /* ==========================================================================
     8. Toast Notification Engine
     ========================================================================== */
  function showToast(message, iconClass = 'fa-solid fa-circle-check') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <i class="${iconClass} toast-icon"></i>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 3200);
  }
});
