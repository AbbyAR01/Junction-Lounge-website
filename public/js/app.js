const API = '/api';

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function loadStats() {
  try {
    const stats = await fetchJSON(`${API}/stats`);
    const el = document.getElementById('stats');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card"><div class="stat-value">${stats.farmers}</div><div class="stat-label">Farmers</div></div>
      <div class="stat-card"><div class="stat-value">${stats.buyers}</div><div class="stat-label">Buyers</div></div>
      <div class="stat-card"><div class="stat-value">${stats.open_orders}</div><div class="stat-label">Open Orders</div></div>
      <div class="stat-card"><div class="stat-value">${stats.commitments}</div><div class="stat-label">Harvests</div></div>
    `;
  } catch (e) {
    console.error('Stats load failed:', e);
  }
}

async function loadPrices(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const prices = await fetchJSON(`${API}/prices/summary`);
    el.innerHTML = prices.map(p => `
      <div class="price-item">
        <div>
          <div class="crop-name">${p.name}</div>
          <div class="crop-unit">per ${p.unit} · ${p.markets} markets</div>
        </div>
        <div style="text-align:right">
          <div class="price-value">GHS ${p.avg_price_ghs}</div>
          <div class="roadside">Roadside ~GHS ${(p.avg_price_ghs * 0.65).toFixed(0)}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<p>Unable to load prices. Is the server running?</p>';
  }
}

async function loadOrders(containerId, status) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const url = status ? `${API}/orders?status=${status}` : `${API}/orders`;
    const orders = await fetchJSON(url);
    if (orders.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No orders found.</p>';
      return;
    }
    el.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-header">
          <div>
            <strong>${o.crop_name}</strong> — ${o.quantity} ${o.unit}
            <div style="font-size:0.8rem;color:var(--text-muted)">${o.buyer_name} (${o.buyer_role})</div>
          </div>
          <span class="badge badge-${o.status}">${o.status}</span>
        </div>
        <div style="font-size:0.85rem">
          Needed by: <strong>${o.needed_by}</strong> ·
          Max: <strong>GHS ${o.max_price_ghs}/${o.unit}</strong><br>
          Deliver to: ${o.delivery_location || 'TBD'}
          ${o.notes ? `<br><em>${o.notes}</em>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<p>Unable to load orders.</p>';
  }
}

async function loadCommitments(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const commits = await fetchJSON(`${API}/commitments?status=available`);
    if (commits.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No harvest commitments available.</p>';
      return;
    }
    el.innerHTML = commits.map(c => `
      <div class="order-card">
        <div class="order-header">
          <div>
            <strong>${c.crop_name}</strong> — ${c.quantity} ${c.unit}
            <div style="font-size:0.8rem;color:var(--text-muted)">${c.farmer_name} · ${c.region || c.district || 'Ghana'}</div>
          </div>
          <span class="badge badge-available">${c.status}</span>
        </div>
        <div style="font-size:0.85rem">
          Harvest: <strong>${c.harvest_date}</strong> ·
          Price: <strong>GHS ${c.asking_price_ghs}/${c.unit}</strong>
        </div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<p>Unable to load commitments.</p>';
  }
}

async function loadTransport(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const runs = await fetchJSON(`${API}/transport`);
    if (runs.length === 0) {
      el.innerHTML = '<p style="color:var(--text-muted)">No transport runs scheduled.</p>';
      return;
    }
    el.innerHTML = runs.map(r => {
      const pct = Math.min(100, (r.booked_kg / r.vehicle_capacity_kg) * 100);
      return `
        <div class="transport-card">
          <div class="transport-icon">🚛</div>
          <div class="transport-info">
            <h3>${r.route_name}</h3>
            <p>${r.origin_region} → ${r.destination}</p>
            <p>${r.departure_date} at ${r.departure_time} · ${r.booking_count} farmers · ${r.status}</p>
            <div class="capacity-bar"><div class="capacity-fill" style="width:${pct}%"></div></div>
            <p style="font-size:0.75rem">${r.booked_kg}/${r.vehicle_capacity_kg} kg</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = '<p>Unable to load transport.</p>';
  }
}

async function loadSmsLog(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    const logs = await fetchJSON(`${API}/sms/log?limit=20`);
    el.innerHTML = logs.map(s => `
      <div class="sms-item sms-${s.direction}">
        <div class="sms-meta">${s.direction === 'outbound' ? '→' : '←'} ${s.phone} · ${s.created_at}</div>
        <div>${s.message}</div>
      </div>
    `).join('');
  } catch (e) {
    el.innerHTML = '<p>Unable to load SMS log.</p>';
  }
}

async function submitOrder(form) {
  const data = Object.fromEntries(new FormData(form));
  const crops = await fetchJSON(`${API}/crops`);
  const crop = crops.find(c => c.id === data.crop_id);
  data.unit = crop ? crop.unit : 'kg';
  data.quantity = parseFloat(data.quantity);
  data.max_price_ghs = parseFloat(data.max_price_ghs);

  const res = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Order failed');
  return res.json();
}

function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabBar => {
    tabBar.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const panelId = tab.dataset.tab;
        tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const parent = tabBar.parentElement;
        parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(panelId)?.classList.add('active');
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  if (document.getElementById('stats')) loadStats();
  if (document.getElementById('price-list')) loadPrices('price-list');
  if (document.getElementById('orders-list')) loadOrders('orders-list');
  if (document.getElementById('commitments-list')) loadCommitments('commitments-list');
  if (document.getElementById('transport-list')) loadTransport('transport-list');
  if (document.getElementById('sms-log')) loadSmsLog('sms-log');
});
