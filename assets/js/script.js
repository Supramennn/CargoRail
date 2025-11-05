/* ===== CargoRail – Auth + Roles (Admin vs User) + E-Ticket + Tracking ===== */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtIDR = (n) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(n);

/* ---------- Users store (auth) ---------- */
const Users = {
    key: "cr_users",
    get() { return JSON.parse(localStorage.getItem(this.key) || "[]"); },
    set(list) { localStorage.setItem(this.key, JSON.stringify(list)); },
    seed() {
        if (!localStorage.getItem(this.key)) {
            this.set([
                { name: "Admin", email: "admin@cargo.test", password: "admin123", role: "admin" },
                { name: "Demo User", email: "user@cargo.test", password: "user123", role: "user" }
            ]);
        }
    },
    findByEmail(email) { return this.get().find(u => u.email === email); },
    add(user) {
        const list = this.get();
        if (list.some(u => u.email === user.email)) return false;
        list.push(user); this.set(list); return true;
    },
    validate(email, password) {
        const u = this.findByEmail(email);
        if (u && u.password === password) return { name: u.name, email: u.email, role: u.role };
        return null;
    }
};

/* ---------- Shipments store ---------- */
const ShipStore = {
    key: "cr_shipments",
    get() { return JSON.parse(localStorage.getItem(this.key) || "[]"); },
    set(list) { localStorage.setItem(this.key, JSON.stringify(list)); },
    seed() {
        if (!localStorage.getItem(this.key)) {
            const now = (m = 0) => new Date(Date.now() + m * 60000).toISOString();
            this.set([
                {
                    id: "CR-2025-001", owner: "user@cargo.test", origin: "BD", destination: "GMR", weight: 12, date: "2025-11-10", status: "Scheduled", cost: 185000,
                    events: [{ at: now(-1800), label: "Created" }, { at: now(-1600), label: "Scheduled" }]
                },
                {
                    id: "CR-2025-002", owner: "user@cargo.test", origin: "GMR", destination: "YK", weight: 6, date: "2025-11-12", status: "In Transit", cost: 230000,
                    events: [{ at: now(-2400), label: "Created" }, { at: now(-2000), label: "Scheduled" }, { at: now(-300), label: "In Transit" }]
                },
                {
                    id: "CR-2025-003", owner: "admin@cargo.test", origin: "BD", destination: "YK", weight: 30, date: "2025-11-14", status: "Delivered", cost: 510000,
                    events: [{ at: now(-5000), label: "Created" }, { at: now(-4800), label: "Scheduled" }, { at: now(-3600), label: "In Transit" }, { at: now(-600), label: "Delivered" }]
                },
            ]);
        }
    },
    update(id, updater) {
        const list = this.get(); const i = list.findIndex(s => s.id === id);
        if (i < 0) return null; list[i] = updater(list[i]); this.set(list); return list[i];
    },
    find(id) { return this.get().find(s => s.id === id); }
};

/* ---------- Auth session ---------- */
const AUTH_KEY = "cr_user";
function currentUser() { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); }
function isLoggedIn() { return !!currentUser(); }
function requireAuth() { if (!isLoggedIn()) location.href = "/pages/login.html"; }
function logout() { localStorage.removeItem(AUTH_KEY); location.href = "/pages/login.html"; }

/* ---------- Domain logic ---------- */
const KM = { BD: 0, GMR: 180, YK: 455 };
const distanceKm = (o, d) => (KM[o] == null || KM[d] == null) ? 200 : Math.abs(KM[d] - KM[o]);
const calcCost = ({ origin, destination, weight }) => {
    const base = 900; const km = distanceKm(origin, destination);
    const blocks = Math.max(1, Math.ceil((parseFloat(weight) || 1) / 5));
    return km * base * blocks + 3000;
};
const NEXT = { "Scheduled": "In Transit", "In Transit": "Delivered", "Delivered": null };

/* ---------- UI utils ---------- */
function countUp(el, to, ms = 900) {
    const start = performance.now(); const from = 0;
    const step = (t) => {
        const p = Math.min(1, (t - start) / ms);
        el.textContent = fmtIDR(Math.round(from + (to - from) * p));
        if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}
function aosInit() {
    const io = new IntersectionObserver(ents => {
        ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { threshold: .18 });
    $$('.aos').forEach(el => io.observe(el));
}
function makeQR(el, text) {
    if (window.QRCode) {
        el.innerHTML = ""; new QRCode(el, { text, width: 172, height: 172 });
    } else {
        el.innerHTML = `<div class="border rounded p-3 small">QR generator offline.<br><code>${text}</code></div>`;
    }
}
const fmtTime = (iso) => new Date(iso).toLocaleString("id-ID", { hour12: false });

/* ---------- Detail modal (role-aware) ---------- */
function openDetailModal(s) {
    const user = currentUser(); const isAdmin = user?.role === "admin";
    const next = NEXT[s.status];

    $("#detailContent").innerHTML = `
    <div class="row g-4">
      <div class="col-md-5">
        <div class="border rounded-3 p-3">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <div class="small text-secondary">E-Ticket</div>
              <div class="fw-bold">${s.id}</div>
            </div>
            <span class="badge ${s.status === 'Delivered' ? 'text-bg-success' : s.status === 'In Transit' ? 'text-bg-primary' : 'text-bg-secondary'}">${s.status}</span>
          </div>
          <div id="qrBox" class="d-grid place-items-center my-3"></div>
          <div class="small">
            <div><i class="bi bi-person me-1"></i>${s.owner}</div>
            <div><i class="bi bi-geo me-1"></i>${s.origin} → ${s.destination}</div>
            <div><i class="bi bi-weight me-1"></i>${s.weight} kg • ${s.date}</div>
            <div><i class="bi bi-cash-coin me-1"></i>${fmtIDR(s.cost)}</div>
          </div>
          <button id="btnDownloadQR" class="btn btn-outline-secondary btn-sm w-100 mt-3"><i class="bi bi-download me-1"></i>Unduh E-Ticket</button>
        </div>
        <div class="mt-3 d-grid">
          ${isAdmin && next ? `<button id="btnNext" class="btn btn-primary">Update Status → ${next}</button>` : `<button class="btn btn-secondary" disabled>Status final / tidak diizinkan</button>`}
        </div>
      </div>
      <div class="col-md-7">
        <div class="border rounded-3 p-3">
          <div class="small text-secondary mb-2">Tracking</div>
          <ul class="timeline list-unstyled" id="trackList">
            ${s.events?.map(ev => `
              <li class="timeline-item">
                <div class="dot"></div>
                <div class="content">
                  <div class="fw-semibold">${ev.label}</div>
                  <div class="text-secondary small">${fmtTime(ev.at)}</div>
                </div>
              </li>`).join('') || '<li class="small text-secondary">Belum ada event.</li>'}
          </ul>
        </div>
      </div>
    </div>`;

    const payload = JSON.stringify({ id: s.id, o: s.origin, d: s.destination, date: s.date, w: s.weight, price: s.cost, owner: s.owner });
    makeQR($("#qrBox"), payload);

    $("#btnDownloadQR")?.addEventListener("click", () => {
        const img = $("#qrBox").querySelector("img") || $("#qrBox").querySelector("canvas");
        if (!img) { alert("QR tidak tersedia."); return; }
        const url = img.toDataURL ? img.toDataURL("image/png") : img.src;
        const a = document.createElement("a"); a.href = url; a.download = `${s.id}_eticket.png`; a.click();
    });

    $("#btnNext")?.addEventListener("click", () => {
        const updated = ShipStore.update(s.id, (x) => {
            const ns = NEXT[x.status]; if (!ns) return x;
            return { ...x, status: ns, events: [...(x.events || []), { at: new Date().toISOString(), label: ns }] };
        });
        openDetailModal(updated); // refresh modal
        renderTable();            // refresh tabel
    });
}

/* ---------- Render table (admin vs user) ---------- */
function renderTable(filter = "") {
    const tbl = $("#shipmentTable"); if (!tbl) return;
    const user = currentUser(); const isAdmin = user?.role === "admin";
    let data = ShipStore.get();
    if (!isAdmin) { data = data.filter(s => s.owner === user.email); } // user hanya lihat miliknya
    if (filter) {
        const q = filter.toLowerCase();
        data = data.filter(s => (`${s.id} ${s.origin} ${s.destination} ${s.status}`).toLowerCase().includes(q));
    }
    tbl.innerHTML = data.map((s, i) => `
    <tr style="animation-delay:${i * 40}ms">
      <td><span class="badge text-bg-dark">${s.id}</span></td>
      <td>${s.origin}</td>
      <td>${s.destination}</td>
      <td>${s.weight} kg</td>
      <td>${s.date}</td>
      <td><span class="badge ${s.status === 'Delivered' ? 'text-bg-success' : s.status === 'In Transit' ? 'text-bg-primary' : 'text-bg-secondary'}">${s.status}</span></td>
      <td>${fmtIDR(s.cost)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-primary" data-id="${s.id}" data-action="detail">
          <i class="bi bi-qr-code me-1"></i>Detail
        </button>
      </td>
    </tr>
  `).join('');

    // KPI
    $("#kpiShipments") && ($("#kpiShipments").textContent = data.length);
    const totalCost = data.reduce((a, b) => a + b.cost, 0);
    if ($("#kpiAvgCost")) countUp($("#kpiAvgCost"), data.length ? Math.round(totalCost / data.length) : 0, 900);

    // anim rows
    const rows = [...tbl.querySelectorAll('tr')]; let i = 0;
    const show = () => { if (i < rows.length) { rows[i++].classList.add('show'); setTimeout(show, 35); } };
    tbl.closest('table').classList.add('row-anim'); show();
}

/* ---------- Router ---------- */
document.addEventListener('DOMContentLoaded', () => {
    Users.seed(); ShipStore.seed();

    const page = location.pathname.split('/').pop();

    // INDEX (opsional animasi)
    if (page === "index.html") {
        aosInit();
        document.querySelectorAll('a[href^="#"]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                const id = a.getAttribute('href').slice(1);
                document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
        // kasih kelas aos ke kartu fitur
        document.querySelectorAll('.feature-card').forEach(c => c.classList.add('aos'));
    }


    // REGISTER
    if (page === "register.html") {
        $("#registerForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = $("#name").value.trim();
            const email = $("#regEmail").value.trim();
            const password = $("#regPassword").value.trim();
            if (!name || !email || !password) return alert("Lengkapi data.");
            const ok = Users.add({ name, email, password, role: "user" });
            if (!ok) return alert("Email sudah terdaftar.");
            alert("Akun dibuat. Silakan masuk.");
            location.href = "/pages/login.html";
        });
    }

    // LOGIN
    if (page === "login.html") {
        $("#loginForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const email = $("#email").value.trim(); const pass = $("#password").value.trim();
            const u = Users.validate(email, pass);
            if (!u) return alert("Email/password salah.");
            localStorage.setItem(AUTH_KEY, JSON.stringify(u));
            location.href = "/pages/dashboard.html";
        });
    }

    // DASHBOARD
    if (page === "dashboard.html") {
        if (!isLoggedIn()) return requireAuth();
        const u = currentUser();
        $("#roleBadge").textContent = u.role.toUpperCase();
        $("#roleBadge").className = `badge ${u.role === 'admin' ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'}`;
        $("#logoutBtn")?.addEventListener('click', logout);

        // tombol Buat Pengiriman hanya untuk user
        if (u.role === 'admin') {
            $("#createBtn")?.classList.add('d-none');
        } else {
            $("#createBtn")?.addEventListener('click', () => location.href = "/pages/form.html");
        }

        $("#searchInput")?.addEventListener('input', (e) => renderTable(e.target.value));
        renderTable();

        // delegasi klik detail
        $("#shipmentTable").addEventListener('click', (ev) => {
            const btn = ev.target.closest('[data-action="detail"]'); if (!btn) return;
            const s = ShipStore.find(btn.dataset.id); if (!s) return;
            const modal = new bootstrap.Modal(document.getElementById('detailModal'));
            openDetailModal(s); modal.show();
        });
    }

    // FORM
    if (page === "form.html") {
        if (!isLoggedIn()) return requireAuth();
        const u = currentUser();
        const shipDate = $("#shipDate");
        if (shipDate && !shipDate.value) shipDate.value = new Date().toISOString().slice(0, 10);

        $("#shipmentForm")?.addEventListener("submit", (e) => {
            e.preventDefault();
            const origin = $("#origin").value, destination = $("#destination").value, weight = $("#weight").value;
            const cost = calcCost({ origin, destination, weight });
            const id = `CR-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`;
            const events = [{ at: new Date().toISOString(), label: "Created" }, { at: new Date().toISOString(), label: "Scheduled" }];
            const list = ShipStore.get();
            list.unshift({ id, owner: u.email, origin, destination, weight: parseFloat(weight), date: shipDate.value, status: "Scheduled", cost, events });
            ShipStore.set(list);
            location.href = "/pages/dashboard.html";
        });
    }
});
