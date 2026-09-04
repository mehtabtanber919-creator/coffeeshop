/**
 * Brew & Bean - Artisanal Coffee & Bakery
 * Main JavaScript Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* ==========================================================================
     0. MCP Server Integration (Secure Proxy Connection)
     ========================================================================== */
  async function sendMcpRequest(method, params = {}) {
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: method,
          params: params,
          id: Date.now()
        })
      });
      if (!response.ok) {
        throw new Error(`Status ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      console.warn('MCP Server connection status:', err.message);
      return { error: 'MCP Server unavailable', status: 'error' };
    }
  }

  // Initialize background connection with MCP Server
  sendMcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'brew-and-bean', version: '1.0.0' }
  });

  /* ==========================================================================
     0.1 Supabase User Session & Profile Engine
     ========================================================================== */
  const AUTH_STORAGE_KEY = 'brew_and_bean_user_v1';
  const navSignUpBtn = document.getElementById('navSignUpBtn');

  function initUserSession() {
    if (!navSignUpBtn) return;

    let savedUser = null;
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) savedUser = JSON.parse(raw);
    } catch (e) {}

    if (savedUser && savedUser.isLoggedIn) {
      const displayName = savedUser.name || 'Member';
      navSignUpBtn.innerHTML = `<i class="fa-solid fa-circle-user"></i> <span class="signup-btn-text">Hi, ${displayName}</span>`;
      navSignUpBtn.href = '#';
      navSignUpBtn.setAttribute('title', `Logged in as ${savedUser.email || displayName}. Click to view account / logout.`);

      navSignUpBtn.onclick = (e) => {
        e.preventDefault();
        showUserAccountModal(savedUser);
      };
    } else {
      navSignUpBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> <span class="signup-btn-text">Sign Up</span>`;
      navSignUpBtn.href = 'auth.html#signup';
      navSignUpBtn.onclick = null;
    }
  }

  /* ==========================================================================
     0.2 Order History Engine (Supabase Backend Linked)
     ========================================================================== */
  const ORDERS_STORAGE_KEY = 'brew_and_bean_orders_v1';
  const orderHistoryModalOverlay = document.getElementById('orderHistoryModalOverlay');
  const closeOrderHistoryModalBtn = document.getElementById('closeOrderHistoryModalBtn');
  const orderHistoryContent = document.getElementById('orderHistoryContent');
  const viewHistoryFromCheckoutBtn = document.getElementById('viewHistoryFromCheckoutBtn');

  function getLoggedInUser() {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.isLoggedIn) return parsed;
      }
    } catch (e) {}
    return null;
  }

  function getLocalOrders() {
    try {
      const raw = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  }

  function saveLocalOrder(order) {
    const list = getLocalOrders();
    list.unshift(order);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(list));
  }

  async function fetchAndShowOrderHistory() {
    if (!orderHistoryModalOverlay || !orderHistoryContent) return;

    orderHistoryModalOverlay.classList.add('active');
    const user = getLoggedInUser();
    const subTitle = document.getElementById('orderHistoryUserSub');
    if (subTitle) {
      subTitle.textContent = user ? `Orders for ${user.name || user.email}` : 'Your recent handcrafted coffee & bakery purchases';
    }

    // 1. Loading State
    orderHistoryContent.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1rem; color: #735D54;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2.2rem; color: #B97841; margin-bottom: 0.8rem;"></i>
        <p style="font-weight: 500; color: #21120D;">Fetching your order history...</p>
      </div>
    `;

    let orders = [];
    let isError = false;

    if (user && user.id) {
      try {
        const token = user.session?.access_token;
        const res = await fetch(`/api/orders/list?user_id=${encodeURIComponent(user.id)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.orders && Array.isArray(data.orders)) {
            orders = data.orders;
          }
        } else {
          isError = true;
        }
      } catch (err) {
        console.warn('Failed to fetch orders from server:', err);
        isError = true;
      }
    }

    // Fallback to local storage cache if server fails or user is offline
    if (orders.length === 0 && (!user || isError)) {
      const localList = getLocalOrders();
      if (user && user.id) {
        orders = localList.filter(o => o.user_id === user.id);
      } else {
        orders = localList;
      }
    }

    // 2. Error State
    if (isError && orders.length === 0) {
      orderHistoryContent.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: #735D54;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.2rem; color: #c93b2b; margin-bottom: 0.8rem;"></i>
          <p style="font-weight: 600; color: #21120D; margin-bottom: 0.4rem;">Unable to load order history</p>
          <p style="font-size: 0.85rem; margin-bottom: 1.2rem;">Please check your connection and try again.</p>
          <button id="retryOrdersBtn" class="btn btn-outline" style="padding: 8px 18px; font-size: 0.85rem;"><i class="fa-solid fa-arrows-rotate"></i> Retry</button>
        </div>
      `;
      const retryBtn = document.getElementById('retryOrdersBtn');
      if (retryBtn) retryBtn.onclick = fetchAndShowOrderHistory;
      return;
    }

    // 3. Empty History State
    if (orders.length === 0) {
      orderHistoryContent.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: #735D54;">
          <div style="width: 60px; height: 60px; margin: 0 auto 1rem; background: var(--cream); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.8rem; color: var(--caramel);">
            <i class="fa-solid fa-mug-hot"></i>
          </div>
          <h4 style="font-size: 1.2rem; color: var(--coffee-brown); margin-bottom: 0.4rem; font-family: 'Playfair Display', serif;">No Orders Yet</h4>
          <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 1.2rem;">You haven't placed any orders with Brew &amp; Bean yet.</p>
          <button id="browseMenuFromHistoryBtn" class="btn btn-primary" style="padding: 10px 24px;">Explore Menu</button>
        </div>
      `;
      const browseBtn = document.getElementById('browseMenuFromHistoryBtn');
      if (browseBtn) {
        browseBtn.onclick = () => {
          closeOrderHistoryModal();
          const menuSection = document.getElementById('menu');
          if (menuSection) menuSection.scrollIntoView({ behavior: 'smooth' });
        };
      }
      return;
    }

    // 4. Populated Orders List State
    orderHistoryContent.innerHTML = orders.map(ord => {
      let itemsList = [];
      try {
        itemsList = typeof ord.items === 'string' ? JSON.parse(ord.items) : (ord.items || []);
      } catch (e) { itemsList = []; }

      const dateStr = ord.created_at ? new Date(ord.created_at).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      }) : 'Recent';

      const status = ord.status || 'Completed';
      const statusColor = status.toLowerCase() === 'completed' ? '#27ae60' : '#d9a362';

      return `
        <div style="background: var(--cream); border: 1px solid var(--border-color); border-radius: 14px; padding: 16px; margin-bottom: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #e5d2be; padding-bottom: 10px; margin-bottom: 10px;">
            <div>
              <strong style="font-size: 0.95rem; color: var(--coffee-brown); font-family: 'Playfair Display', serif;">${ord.order_number || '#BB-ORDER'}</strong>
              <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;"><i class="fa-regular fa-clock" style="margin-right: 4px;"></i>${dateStr}</div>
            </div>
            <span style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}40; font-size: 0.75rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
              <i class="fa-solid fa-circle-check" style="margin-right: 4px;"></i>${status}
            </span>
          </div>

          <ul style="list-style: none; padding: 0; margin: 0 0 10px 0; font-size: 0.85rem; color: #21120D;">
            ${itemsList.map(item => `
              <li style="display: flex; justify-content: space-between; padding: 3px 0;">
                <span>${item.qty || 1}x ${item.name}</span>
                <strong>₹${(item.price || 0) * (item.qty || 1)}</strong>
              </li>
            `).join('')}
          </ul>

          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #e5d2be; padding-top: 8px; font-size: 0.9rem;">
            <span style="color: var(--text-muted); font-size: 0.82rem;">Total Amount Paid</span>
            <strong style="font-size: 1.05rem; color: var(--coffee-brown);">₹${ord.total_amount || 0}</strong>
          </div>
        </div>
      `;
    }).join('');
  }

  function closeOrderHistoryModal() {
    if (orderHistoryModalOverlay) orderHistoryModalOverlay.classList.remove('active');
  }

  if (closeOrderHistoryModalBtn) closeOrderHistoryModalBtn.addEventListener('click', closeOrderHistoryModal);
  if (viewHistoryFromCheckoutBtn) {
    viewHistoryFromCheckoutBtn.addEventListener('click', () => {
      const checkoutModalOverlay = document.getElementById('checkoutModalOverlay');
      if (checkoutModalOverlay) checkoutModalOverlay.classList.remove('active');
      fetchAndShowOrderHistory();
    });
  }

  function showUserAccountModal(user) {
    let modalOverlay = document.getElementById('userProfileModalOverlay');
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.id = 'userProfileModalOverlay';
      modalOverlay.className = 'modal-overlay active';
      modalOverlay.style.zIndex = '999999';
      modalOverlay.innerHTML = `
        <div class="modal-card user-profile-card text-center" style="max-width: 420px; background: #1e1b18; color: #fff; padding: 28px; border-radius: 20px; border: 1px solid rgba(217, 163, 98, 0.3); box-shadow: 0 20px 40px rgba(0,0,0,0.6); position: relative; margin: auto;">
          <button class="modal-close-btn" id="closeProfileModalBtn" style="position: absolute; top: 16px; right: 16px; background: transparent; border: none; color: #aaa; font-size: 20px; cursor: pointer;"><i class="fa-solid fa-xmark"></i></button>
          <div style="width: 70px; height: 70px; margin: 0 auto 16px; background: linear-gradient(135deg, #d9a362, #c93b2b); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #fff;">
            <i class="fa-solid fa-crown"></i>
          </div>
          <h3 style="font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 6px; color: #f4e8d3;" id="profileModalName">${user.name || 'Valued Member'}</h3>
          <p style="color: #cbb9a3; font-size: 14px; margin-bottom: 18px;" id="profileModalEmail">${user.email || ''}</p>

          <div style="background: rgba(255,255,255,0.05); padding: 14px; border-radius: 12px; margin-bottom: 20px; text-align: left; font-size: 13px; color: #ddd;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <span><i class="fa-solid fa-phone" style="color:#d9a362; width: 18px;"></i> Phone:</span>
              <strong id="profileModalPhone">${user.phone || 'N/A'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <span><i class="fa-solid fa-calendar-day" style="color:#d9a362; width: 18px;"></i> Member Since:</span>
              <strong>${user.memberSince || '2026'}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span><i class="fa-solid fa-tag" style="color:#27ae60; width: 18px;"></i> Member Perk:</span>
              <strong style="color: #27ae60;">15% Off Unlocked</strong>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button class="btn btn-outline" id="profileOrderHistoryBtn" style="padding: 12px; border-color: #d9a362; color: #d9a362; font-size: 14px;"><i class="fa-solid fa-clock-rotate-left"></i> View Order History</button>
            <div style="display: flex; gap: 10px;">
              <button class="btn btn-outline" id="closeProfileDoneBtn" style="flex: 1; padding: 12px;">Close</button>
              <button class="btn btn-primary" id="logoutBtn" style="flex: 1; padding: 12px; background: #c93b2b; border-color: #c93b2b;"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modalOverlay);
    } else {
      document.getElementById('profileModalName').textContent = user.name || 'Valued Member';
      document.getElementById('profileModalEmail').textContent = user.email || '';
      document.getElementById('profileModalPhone').textContent = user.phone || 'N/A';
      modalOverlay.classList.add('active');
    }

    const closeModal = () => modalOverlay.classList.remove('active');
    document.getElementById('closeProfileModalBtn').onclick = closeModal;
    document.getElementById('closeProfileDoneBtn').onclick = closeModal;

    const profileOrderHistoryBtn = document.getElementById('profileOrderHistoryBtn');
    if (profileOrderHistoryBtn) {
      profileOrderHistoryBtn.onclick = () => {
        closeModal();
        fetchAndShowOrderHistory();
      };
    }

    document.getElementById('logoutBtn').onclick = async () => {
      try {
        const access_token = user.session?.access_token;
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': access_token ? `Bearer ${access_token}` : ''
          }
        });
      } catch (e) {}

      localStorage.removeItem(AUTH_STORAGE_KEY);
      closeModal();
      initUserSession();
      showToast('Logged out successfully. See you soon!', 'fa-solid fa-right-from-bracket');
    };
  }

  initUserSession();

  /* ==========================================================================
     1. State Management: Shopping Cart
     ========================================================================== */
  const CART_STORAGE_KEY = 'brew_and_bean_cart_v1';
  let cart = [];

  // Load cart from LocalStorage
  function loadCart() {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        cart = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not parse cart from localStorage:', e);
      cart = [];
    }
  }

  // Save cart to LocalStorage
  function saveCart() {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.error('Could not save cart to localStorage:', e);
    }
  }

  // Cart DOM Elements
  const cartBtn = document.getElementById('cartBtn');
  const cartBadge = document.getElementById('cartBadge');
  const cartDrawer = document.getElementById('cartDrawer');
  const cartOverlay = document.getElementById('cartOverlay');
  const cartCloseBtn = document.getElementById('cartCloseBtn');
  const cartItemsList = document.getElementById('cartItemsList');
  const cartDrawerCount = document.getElementById('cartDrawerCount');
  const cartSubtotal = document.getElementById('cartSubtotal');
  const cartTaxes = document.getElementById('cartTaxes');
  const cartTotal = document.getElementById('cartTotal');
  const deliveryText = document.getElementById('deliveryText');
  const deliveryPercent = document.getElementById('deliveryPercent');
  const deliveryBarFill = document.getElementById('deliveryBarFill');
  const checkoutBtn = document.getElementById('checkoutBtn');
  const clearCartBtn = document.getElementById('clearCartBtn');

  // Checkout Modal Elements
  const checkoutModalOverlay = document.getElementById('checkoutModalOverlay');
  const closeCheckoutModalBtn = document.getElementById('closeCheckoutModalBtn');
  const receiptSummary = document.getElementById('receiptSummary');
  const modalOkBtn = document.getElementById('modalOkBtn');

  // Toggle Cart Drawer
  function openCart() {
    cartDrawer.classList.add('active');
    cartOverlay.classList.add('active');
    document.body.classList.add('scroll-locked');
  }

  function closeCart() {
    cartDrawer.classList.remove('active');
    cartOverlay.classList.remove('active');
    document.body.classList.remove('scroll-locked');
  }

  if (cartBtn) cartBtn.addEventListener('click', openCart);
  if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
  if (cartOverlay) cartOverlay.addEventListener('click', closeCart);

  // Add Item to Cart
  function addToCart(id, name, price, img) {
    const existingIndex = cart.findIndex(item => item.id === id);
    if (existingIndex > -1) {
      cart[existingIndex].qty += 1;
    } else {
      cart.push({
        id,
        name,
        price: Number(price),
        img,
        qty: 1
      });
    }

    saveCart();
    renderCart();
    triggerBadgeBump();
    showToast(`Added "${name}" to your bag!`, 'fa-solid fa-mug-hot');
  }

  // Animate Badge Bump
  function triggerBadgeBump() {
    if (!cartBadge) return;
    cartBadge.classList.add('bump');
    setTimeout(() => {
      cartBadge.classList.remove('bump');
    }, 300);
  }

  // Update Item Quantity
  function updateItemQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
      cart = cart.filter(i => i.id !== id);
      showToast(`Removed "${item.name}" from bag`, 'fa-solid fa-trash-can');
    }

    saveCart();
    renderCart();
  }

  // Remove Item Completely
  function removeItem(id) {
    const item = cart.find(i => i.id === id);
    if (item) {
      cart = cart.filter(i => i.id !== id);
      saveCart();
      renderCart();
      showToast(`Removed "${item.name}"`, 'fa-solid fa-trash-can');
    }
  }

  // Clear Entire Cart
  if (clearCartBtn) {
    clearCartBtn.addEventListener('click', () => {
      if (cart.length === 0) return;
      if (confirm('Are you sure you want to clear your order?')) {
        cart = [];
        saveCart();
        renderCart();
        showToast('Cart cleared', 'fa-solid fa-circle-info');
      }
    });
  }

  // Render Cart UI
  function renderCart() {
    const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const taxAndPackaging = subtotal > 0 ? Math.round(subtotal * 0.05) : 0;
    const finalTotal = subtotal + taxAndPackaging;

    // Update Badges & Counts
    if (cartBadge) cartBadge.textContent = totalItems;
    if (cartDrawerCount) cartDrawerCount.textContent = totalItems;

    // Update Totals
    if (cartSubtotal) cartSubtotal.textContent = `₹${subtotal.toLocaleString('en-IN')}`;
    if (cartTaxes) cartTaxes.textContent = `₹${taxAndPackaging.toLocaleString('en-IN')}`;
    if (cartTotal) cartTotal.textContent = `₹${finalTotal.toLocaleString('en-IN')}`;

    // Free delivery progress bar (Threshold: ₹499)
    const deliveryThreshold = 499;
    if (deliveryBarFill && deliveryText && deliveryPercent) {
      if (subtotal === 0) {
        deliveryBarFill.style.width = '0%';
        deliveryPercent.textContent = '0%';
        deliveryText.textContent = `Add ₹${deliveryThreshold} for Free Delivery!`;
      } else if (subtotal >= deliveryThreshold) {
        deliveryBarFill.style.width = '100%';
        deliveryPercent.textContent = '100%';
        deliveryText.innerHTML = '<span style="color:#2e7d32;"><i class="fa-solid fa-circle-check"></i> Free Delivery Unlocked!</span>';
      } else {
        const percent = Math.min(100, Math.round((subtotal / deliveryThreshold) * 100));
        const needed = deliveryThreshold - subtotal;
        deliveryBarFill.style.width = `${percent}%`;
        deliveryPercent.textContent = `${percent}%`;
        deliveryText.textContent = `Add ₹${needed} more for Free Delivery!`;
      }
    }

    // Render Items
    if (!cartItemsList) return;

    if (cart.length === 0) {
      cartItemsList.innerHTML = `
        <div class="cart-empty-state">
          <div class="cart-empty-icon">
            <i class="fa-solid fa-mug-saucer"></i>
          </div>
          <h4>Your bag is empty</h4>
          <p>Treat yourself to a fresh cup of coffee or artisanal morning bakes.</p>
          <a href="#menu" class="btn btn-primary btn-sm" onclick="document.getElementById('cartCloseBtn').click();">
            Explore Menu
          </a>
        </div>
      `;
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.style.opacity = '0.5';
        checkoutBtn.style.cursor = 'not-allowed';
      }
    } else {
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.style.opacity = '1';
        checkoutBtn.style.cursor = 'pointer';
      }

      cartItemsList.innerHTML = cart.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <img src="${item.img}" alt="${item.name}" class="cart-item-img" loading="lazy">
          <div class="cart-item-info">
            <h4 class="cart-item-name">${item.name}</h4>
            <span class="cart-item-price">₹${item.price} each</span>
            <div class="cart-item-controls">
              <button class="qty-btn dec-qty" data-id="${item.id}" aria-label="Decrease quantity">
                <i class="fa-solid fa-minus"></i>
              </button>
              <span class="qty-display">${item.qty}</span>
              <button class="qty-btn inc-qty" data-id="${item.id}" aria-label="Increase quantity">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>
          <button class="cart-item-remove" data-id="${item.id}" aria-label="Remove item">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </div>
      `).join('');

      // Attach item control listeners
      cartItemsList.querySelectorAll('.inc-qty').forEach(btn => {
        btn.addEventListener('click', () => updateItemQty(btn.dataset.id, 1));
      });
      cartItemsList.querySelectorAll('.dec-qty').forEach(btn => {
        btn.addEventListener('click', () => updateItemQty(btn.dataset.id, -1));
      });
      cartItemsList.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', () => removeItem(btn.dataset.id));
      });
    }
  }

  // Handle Checkout Click
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => {
      if (cart.length === 0) return;

      const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
      const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
      const tax = Math.round(subtotal * 0.05);
      const finalAmount = subtotal + tax;
      const orderId = 'BB-' + Math.floor(100000 + Math.random() * 900000);

      // Build receipt breakdown
      const receiptHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom: 0.6rem; font-weight:700;">
          <span>Order ID: ${orderId}</span>
          <span style="color:#B97841;">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <ul style="border-top:1px solid #e5d2be; border-bottom:1px solid #e5d2be; padding: 0.5rem 0; margin-bottom: 0.6rem;">
          ${cart.map(i => `
            <li style="display:flex; justify-content:space-between; padding: 0.25rem 0;">
              <span>${i.qty}x ${i.name}</span>
              <strong>₹${i.price * i.qty}</strong>
            </li>
          `).join('')}
        </ul>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#735D54;">
          <span>Items (${totalItems})</span>
          <span>₹${subtotal}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:#735D54; margin-bottom: 0.3rem;">
          <span>Taxes &amp; Packaging (5%)</span>
          <span>₹${tax}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight:800; font-size:1.05rem; color:#21120D; border-top:1px dashed #e5d2be; padding-top:0.4rem;">
          <span>Total Paid</span>
          <span>₹${finalAmount}</span>
        </div>
      `;

      if (receiptSummary) receiptSummary.innerHTML = receiptHTML;

      // Save order to Supabase Backend & Local Storage Cache
      const user = getLoggedInUser();
      const orderPayload = {
        order_number: orderId,
        user_id: user ? user.id : null,
        items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
        subtotal: subtotal,
        tax: tax,
        total_amount: finalAmount,
        status: 'Completed'
      };

      saveLocalOrder({
        ...orderPayload,
        created_at: new Date().toISOString()
      });

      try {
        const token = user?.session?.access_token;
        fetch('/api/orders/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
          },
          body: JSON.stringify(orderPayload)
        }).catch(err => console.warn('Order background sync:', err));
      } catch (e) {}

      // Close drawer & open modal
      closeCart();
      if (checkoutModalOverlay) checkoutModalOverlay.classList.add('active');

      // Reset cart
      cart = [];
      saveCart();
      renderCart();
    });
  }

  // Close Checkout Modal
  function closeCheckoutModal() {
    if (checkoutModalOverlay) checkoutModalOverlay.classList.remove('active');
  }
  if (closeCheckoutModalBtn) closeCheckoutModalBtn.addEventListener('click', closeCheckoutModal);
  if (modalOkBtn) modalOkBtn.addEventListener('click', closeCheckoutModal);

  /* ==========================================================================
     2. Product Add-to-Cart Buttons Binding
     ========================================================================== */
  // Product grid add buttons
  document.querySelectorAll('.add-to-cart-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const id = button.dataset.id;
      const name = button.dataset.name;
      const price = button.dataset.price;
      const img = button.dataset.img;
      addToCart(id, name, price, img);
    });
  });

  // Floating Pick Card button
  const addPickBtn = document.querySelector('.add-pick-btn');
  if (addPickBtn) {
    addPickBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addToCart(
        addPickBtn.dataset.id,
        addPickBtn.dataset.name,
        addPickBtn.dataset.price,
        addPickBtn.dataset.img
      );
    });
  }

  // Special Offer "Grab The Deal" button
  const grabDealBtn = document.getElementById('grabDealBtn');
  if (grabDealBtn) {
    grabDealBtn.addEventListener('click', () => {
      addToCart(
        'morning-deal-combo',
        'Morning Brew Deal (Coffee + Croissant)',
        199,
        'https://images.unsplash.com/photo-1521017432531-fbd92d768814?q=80&w=700&auto=format&fit=crop'
      );
      openCart();
    });
  }

  /* ==========================================================================
     3. Menu Category Filtering
     ========================================================================== */
  const filterBtns = document.querySelectorAll('.filter-btn');
  const productCards = document.querySelectorAll('.product-card');

  function applyCategoryFilter(targetCategory) {
    // Update active tab button
    filterBtns.forEach(btn => {
      if (btn.dataset.category === targetCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Filter cards
    productCards.forEach(card => {
      const cardCategory = card.dataset.category;
      if (targetCategory === 'all' || cardCategory === targetCategory) {
        card.classList.remove('hidden');
        card.style.animation = 'fadeIn 0.35s ease';
      } else {
        card.classList.add('hidden');
      }
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyCategoryFilter(btn.dataset.category);
    });
  });

  // Category cards in the "Explore Our Delights" section
  document.querySelectorAll('.category-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const filter = link.dataset.filter;
      if (filter) {
        applyCategoryFilter(filter);
      }
    });
  });

  // Footer category links
  document.querySelectorAll('[data-footer-filter]').forEach(link => {
    link.addEventListener('click', () => {
      const filter = link.dataset.footerFilter;
      if (filter) {
        applyCategoryFilter(filter);
      }
    });
  });

  /* ==========================================================================
     4. Sticky Navbar & Mobile Navigation
     ========================================================================== */
  const navbar = document.getElementById('navbar');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const navMenu = document.getElementById('navMenu');
  const navLinks = document.querySelectorAll('.nav-link');

  // Sticky navbar shadow on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 25) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    // Back to top visibility
    const backToTopBtn = document.getElementById('backToTopBtn');
    if (backToTopBtn) {
      if (window.scrollY > 400) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    }
  }, { passive: true });

  // Mobile Menu Drawer Toggle
  if (hamburgerBtn && navMenu) {
    hamburgerBtn.addEventListener('click', () => {
      const isActive = navMenu.classList.toggle('active');
      hamburgerBtn.classList.toggle('active');
      hamburgerBtn.setAttribute('aria-expanded', isActive);
      document.body.classList.toggle('scroll-locked', isActive);
    });

    // Close menu when clicking a link
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburgerBtn.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('scroll-locked');
      });
    });
  }

  // Back to top action
  const backToTopBtn = document.getElementById('backToTopBtn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Active section indicator on scroll
  const sections = document.querySelectorAll('section[id]');
  function highlightCurrentNav() {
    const scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }
  window.addEventListener('scroll', highlightCurrentNav, { passive: true });

  /* ==========================================================================
     5. Table Reservation Form Validation & Modal
     ========================================================================== */
  const reservationForm = document.getElementById('reservationForm');
  const resModalOverlay = document.getElementById('resModalOverlay');
  const closeResModalBtn = document.getElementById('closeResModalBtn');
  const resDoneBtn = document.getElementById('resDoneBtn');
  const resModalDetails = document.getElementById('resModalDetails');

  // Input fields
  const resName = document.getElementById('resName');
  const resPhone = document.getElementById('resPhone');
  const resDate = document.getElementById('resDate');
  const resTime = document.getElementById('resTime');
  const resGuests = document.getElementById('resGuests');
  const resRequests = document.getElementById('resRequests');

  // Set min date to today
  if (resDate) {
    const today = new Date().toISOString().split('T')[0];
    resDate.setAttribute('min', today);
  }

  // Validation helper
  function validateField(input, errorEl, condition, message) {
    if (!condition) {
      errorEl.textContent = message;
      input.style.borderColor = '#c93b2b';
      return false;
    } else {
      errorEl.textContent = '';
      input.style.borderColor = '';
      return true;
    }
  }

  if (reservationForm) {
    reservationForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameVal = resName.value.trim();
      const phoneVal = resPhone.value.trim();
      const dateVal = resDate.value;
      const timeVal = resTime.value;
      const guestsVal = resGuests.value;
      const requestsVal = resRequests.value.trim();

      const isNameValid = validateField(
        resName, 
        document.getElementById('resNameError'),
        nameVal.length >= 2,
        'Please enter your full name (at least 2 characters).'
      );

      const isPhoneValid = validateField(
        resPhone,
        document.getElementById('resPhoneError'),
        /^[\d\s+\-()]{8,}$/.test(phoneVal),
        'Please enter a valid phone number (at least 8 digits).'
      );

      const isDateValid = validateField(
        resDate,
        document.getElementById('resDateError'),
        dateVal !== '',
        'Please select your reservation date.'
      );

      const isTimeValid = validateField(
        resTime,
        document.getElementById('resTimeError'),
        timeVal !== '',
        'Please choose your preferred time slot.'
      );

      if (isNameValid && isPhoneValid && isDateValid && isTimeValid) {
        // Format booking details for modal
        const formattedDate = new Date(dateVal).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        if (resModalDetails) {
          resModalDetails.innerHTML = `
            Dear <strong>${nameVal}</strong>, we have reserved a spot for 
            <strong>${guestsVal} guest(s)</strong> on <strong>${formattedDate}</strong> at 
            <strong>${timeVal}</strong>.<br><br>
            A confirmation SMS has been sent to <strong>${phoneVal}</strong>.
            ${requestsVal ? `<br><em>Special note recorded: "${requestsVal}"</em>` : ''}
          `;
        }

        if (resModalOverlay) resModalOverlay.classList.add('active');
        reservationForm.reset();
        showToast('Table successfully booked!', 'fa-solid fa-calendar-check');
      }
    });
  }

  function closeResModal() {
    if (resModalOverlay) resModalOverlay.classList.remove('active');
  }
  if (closeResModalBtn) closeResModalBtn.addEventListener('click', closeResModal);
  if (resDoneBtn) resDoneBtn.addEventListener('click', closeResModal);

  /* ==========================================================================
     6. Newsletter Subscription Form
     ========================================================================== */
  const newsletterForm = document.getElementById('newsletterForm');
  const newsEmail = document.getElementById('newsEmail');
  const newsletterSuccess = document.getElementById('newsletterSuccess');

  if (newsletterForm) {
    newsletterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = newsEmail.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(email)) {
        newsEmail.style.borderColor = '#c93b2b';
        showToast('Please provide a valid email address.', 'fa-solid fa-triangle-exclamation');
        return;
      }

      newsEmail.style.borderColor = '';
      newsletterForm.style.display = 'none';
      if (newsletterSuccess) newsletterSuccess.style.display = 'inline-flex';
      showToast('Welcome to the Brew & Bean family!', 'fa-solid fa-envelope-open-text');
    });
  }

  /* ==========================================================================
     7. Photo Gallery Lightbox
     ========================================================================== */
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxImage = document.getElementById('lightboxImage');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

  document.querySelectorAll('.gallery-item').forEach(item => {
    item.addEventListener('click', () => {
      const fullUrl = item.dataset.full;
      const caption = item.dataset.caption;
      if (lightboxImage) lightboxImage.src = fullUrl;
      if (lightboxCaption) lightboxCaption.textContent = caption;
      if (lightboxModal) lightboxModal.classList.add('active');
      document.body.classList.add('scroll-locked');
    });
  });

  function closeLightbox() {
    if (lightboxModal) lightboxModal.classList.remove('active');
    document.body.classList.remove('scroll-locked');
  }

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }

  /* ==========================================================================
     8. Discover Our Story Modal
     ========================================================================== */
  const openStoryModalBtn = document.getElementById('openStoryModalBtn');
  const storyModalOverlay = document.getElementById('storyModalOverlay');
  const closeStoryModalBtn = document.getElementById('closeStoryModalBtn');
  const closeStoryActionBtn = document.getElementById('closeStoryActionBtn');

  function openStoryModal() {
    if (storyModalOverlay) storyModalOverlay.classList.add('active');
  }
  function closeStoryModal() {
    if (storyModalOverlay) storyModalOverlay.classList.remove('active');
  }

  if (openStoryModalBtn) openStoryModalBtn.addEventListener('click', openStoryModal);
  if (closeStoryModalBtn) closeStoryModalBtn.addEventListener('click', closeStoryModal);
  if (closeStoryActionBtn) {
    closeStoryActionBtn.addEventListener('click', () => {
      closeStoryModal();
      const menuSec = document.getElementById('menu');
      if (menuSec) menuSec.scrollIntoView({ behavior: 'smooth' });
    });
  }

  /* ==========================================================================
     9. Global Escape Key Listener for Modals & Drawers
     ========================================================================== */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCart();
      closeLightbox();
      closeResModal();
      closeStoryModal();
      closeCheckoutModal();
    }
  });

  /* ==========================================================================
     10. Toast Notification Engine
     ========================================================================== */
  const toastContainer = document.getElementById('toastContainer');

  function showToast(message, iconClass = 'fa-solid fa-circle-check') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <i class="${iconClass} toast-icon"></i>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Trigger transition
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Remove after 3.2 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 3200);
  }

  // Initialize cart display on first load
  loadCart();
  renderCart();
});
