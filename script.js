/**
 * Lumina Dental Studio — Script Principal (Vista Pública)
 * Scroll-video engine + Socket.io client + Booking modal
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Lucide Icons ──────────────────────────────────────── */
  if (typeof lucide !== 'undefined') lucide.createIcons();

  /* ── DOM refs ──────────────────────────────────────────── */
  const navbar       = document.getElementById('navbar');
  const canvas       = document.getElementById('bg-canvas');
  const videoEl      = document.getElementById('bg-video');
  const hamburger    = document.getElementById('hamburger');
  const mobileMenu   = document.getElementById('mobile-menu');
  const modal        = document.getElementById('booking-modal');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose   = document.getElementById('modal-close');
  const form         = document.getElementById('appointment-form');
  const successDiv   = document.getElementById('booking-success');
  const successMsg   = document.getElementById('success-message');
  const closeSuccess = document.getElementById('close-success');
  const submitBtn    = document.getElementById('submit-btn');
  const connToast    = document.getElementById('connection-toast');
  const sections     = document.querySelectorAll('section[id]');
  const navLinks     = document.querySelectorAll('.nav-link');

  /* ── Helpers ───────────────────────────────────────────── */
  function showToast(msg, type = 'connected', duration = 3000) {
    connToast.textContent = msg;
    connToast.className   = `connection-toast ${type}`;
    connToast.style.display = 'block';
    clearTimeout(connToast._timer);
    connToast._timer = setTimeout(() => { connToast.style.display = 'none'; }, duration);
  }

  /* ── Navbar scroll ─────────────────────────────────────── */
  function onScroll() {
    navbar.classList.toggle('scrolled', window.scrollY > 40);

    // Active nav link
    let current = '';
    sections.forEach(s => {
      if (window.scrollY >= s.offsetTop - 120) current = s.id;
    });
    navLinks.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === `#${current}`);
    });

    // Video scrubbing
    targetProgress = getScrollProgress();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ── Hamburger ─────────────────────────────────────────── */
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });
  document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });

  /* ── Modal open/close ──────────────────────────────────── */
  function openModal() {
    modal.classList.add('open');
    form.style.display = '';
    successDiv.style.display = 'none';
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('f-date');
    if (dateInput) {
      dateInput.min = today;
      if (!dateInput.value) {
        // default to first available future date or tomorrow
        const tomorrow = getTomorrowStr();
        dateInput.value = tomorrow;
      }
    }
    updateModalTimeOptions();
    document.getElementById('f-name').focus();
  }
  function getTomorrowStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function closeModal() {
    modal.classList.remove('open');
  }

  // Smooth scroll for all hash navigation links (including Reservar Turno -> #turnos-disponibles)
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerOffset = 70;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  if (closeSuccess) {
    closeSuccess.addEventListener('click', closeModal);
  }

  /* ── Turnos Disponibles (Slots) & Sincronización en Tiempo Real ── */
  let bookedAppointments = [];
  let databaseSlots      = [];

  function dateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function renderAvailableSlots() {
    const gridContainer = document.getElementById('slots-grid-container');
    if (!gridContainer) return;

    const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const todayStr = dateKey(new Date());

    // Fechas futuras con horarios en la base de datos
    let dates = [...new Set(databaseSlots.map(s => s.date))]
      .filter(d => d >= todayStr)
      .sort();

    // Si todavía no cargó la BD, generar los próximos 4 días hábiles
    if (dates.length === 0) {
      for (let i = 1; i <= 6; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        if (d.getDay() === 0) continue;
        dates.push(dateKey(d));
        if (dates.length >= 4) break;
      }
    }

    const displayDates = dates.slice(0, 4);

    gridContainer.innerHTML = displayDates.map((dateStr) => {
      const [yyyy, mm, dd] = dateStr.split('-');
      const dObj = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      const dayName = dayNames[dObj.getDay()] || 'Día';
      const formattedDate = `${parseInt(dd)} de ${monthNames[parseInt(mm) - 1]}, ${yyyy}`;

      const daySlotsFromDB = databaseSlots.filter(s => s.date === dateStr);
      let dayTimes = daySlotsFromDB.length > 0
        ? daySlotsFromDB.filter(s => s.is_active === 1).map(s => s.time)
        : ['09:00', '10:00', '11:30', '14:30', '16:00', '17:00'];

      dayTimes.sort();

      const availableTimes = dayTimes.filter(t =>
        !bookedAppointments.some(a => a.date === dateStr && a.time === t && a.status !== 'cancelled')
      );

      const availableCount = availableTimes.length;
      const isFull = availableCount === 0;
      const firstAvailableTime = availableTimes[0] || '';

      const timeButtonsHtml = isFull
        ? `<div class="slot-empty-notice">Todos los turnos de este día han sido reservados.</div>`
        : dayTimes.map(t => {
            const isBooked = bookedAppointments.some(a => a.date === dateStr && a.time === t && a.status !== 'cancelled');
            return `<button type="button" class="slot-time-btn ${isBooked ? 'booked' : ''}" data-date="${dateStr}" data-time="${t}"><i data-lucide="clock"></i> ${t}</button>`;
          }).join('');

      return `
        <div class="slot-card" data-full-date="${dateStr}">
          <div class="slot-card-head">
            <div>
              <div class="slot-day-title">${dayName}</div>
              <div class="slot-day-date">${formattedDate}</div>
            </div>
            <span class="slot-badge-count ${isFull ? 'full' : ''}">
              ${isFull ? 'Sin cupos' : `✦ ${availableCount} ${availableCount === 1 ? 'cupo' : 'cupos'}`}
            </span>
          </div>
          <div class="slot-times-list">
            ${timeButtonsHtml}
          </div>
          <button type="button" class="slot-card-cta open-slot-booking" data-date="${dateStr}" data-time="${firstAvailableTime || '09:30'}" ${isFull ? 'disabled' : ''}>
            <i data-lucide="${isFull ? 'calendar-x' : 'calendar-plus'}"></i>
            ${isFull ? 'Día completo' : 'Reservar día'}
          </button>
        </div>
      `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [gridContainer] });

    // Clicks en botones de horario
    gridContainer.querySelectorAll('.slot-time-btn:not(.booked)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const dateStr = btn.dataset.date;
        const timeStr = btn.dataset.time;
        openModal();
        const dateInput = document.getElementById('f-date');
        if (dateInput) {
          dateInput.value = dateStr;
          updateModalTimeOptions(timeStr);
        }
      });
    });

    // Clicks en CTA de reservar día
    gridContainer.querySelectorAll('.open-slot-booking:not(:disabled)').forEach(ctaBtn => {
      ctaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const dateStr = ctaBtn.dataset.date;
        const timeStr = ctaBtn.dataset.time || '';
        openModal();
        const dateInput = document.getElementById('f-date');
        if (dateInput) {
          dateInput.value = dateStr;
          updateModalTimeOptions(timeStr);
        }
      });
    });
  }

  function updateModalTimeOptions(desiredTime = '') {
    const dateInput  = document.getElementById('f-date');
    const timeSelect = document.getElementById('f-time');
    const submitBtn  = document.getElementById('submit-btn');
    if (!dateInput || !timeSelect) return;

    const selectedDate = dateInput.value;
    if (!selectedDate) {
      timeSelect.innerHTML = '<option value="" disabled selected>Seleccioná una fecha primero</option>';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // Filtrar slots de la base de datos para la fecha seleccionada que estén activos
    const daySlots = databaseSlots.filter(s => s.date === selectedDate && s.is_active === 1);

    if (daySlots.length === 0) {
      timeSelect.innerHTML = '<option value="" disabled selected>No hay turnos disponibles para esta fecha</option>';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    // Ordenar cronológicamente
    const sorted = [...daySlots].sort((a, b) => a.time.localeCompare(b.time));

    let availableCount = 0;
    let optionsHtml = '<option value="" disabled selected>Elegí un horario disponible</option>';

    sorted.forEach(slot => {
      const isBooked = bookedAppointments.some(a => a.date === selectedDate && a.time === slot.time && a.status !== 'cancelled');
      if (isBooked) {
        optionsHtml += `<option value="${slot.time}" disabled style="color:#94a3b8; background:#f1f5f9;">${slot.time} — (Reservado / No disponible)</option>`;
      } else {
        availableCount++;
        const isSelected = desiredTime && desiredTime === slot.time ? 'selected' : '';
        optionsHtml += `<option value="${slot.time}" ${isSelected}>✦ ${slot.time} (Disponible)</option>`;
      }
    });

    if (availableCount === 0) {
      timeSelect.innerHTML = '<option value="" disabled selected>Todos los horarios de esta fecha están reservados</option>';
      if (submitBtn) submitBtn.disabled = true;
    } else {
      timeSelect.innerHTML = optionsHtml;
      if (submitBtn) submitBtn.disabled = false;
      if (desiredTime && sorted.some(s => s.time === desiredTime && !bookedAppointments.some(a => a.date === selectedDate && a.time === s.time && a.status !== 'cancelled'))) {
        timeSelect.value = desiredTime;
      }
    }
  }

  // Vincular cambio de fecha en el modal para actualizar opciones de horario
  const datePicker = document.getElementById('f-date');
  if (datePicker) {
    datePicker.addEventListener('change', () => updateModalTimeOptions());
  }

  renderAvailableSlots();

  /* ── Firebase Firestore Real-Time Synchronization ─────── */
  function initFirestoreSync() {
    if (!window.db) {
      console.info('[Firebase] Modo demostración / Local. Pegá tus credenciales en firebase-config.js para sincronizar en tiempo real.');
      return;
    }

    try {
      // 1. Escuchar turnos agendados en tiempo real
      db.collection('appointments').onSnapshot((snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        bookedAppointments = list;
        renderAvailableSlots();
        updateModalTimeOptions();
        showToast('✓ Turnos sincronizados con Firebase', 'connected', 2000);
      }, (error) => {
        console.warn('[Firebase] Error al escuchar turnos:', error.message);
      });

      // 2. Escuchar horarios habilitados en tiempo real
      db.collection('available_slots').onSnapshot((snapshot) => {
        const list = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          list.push({
            id: doc.id,
            date: data.date,
            time: data.time,
            is_active: data.is_active === true || data.is_active === 1 ? 1 : 0
          });
        });
        databaseSlots = list;
        renderAvailableSlots();
        updateModalTimeOptions();
      }, (error) => {
        console.warn('[Firebase] Error al escuchar horarios:', error.message);
      });
    } catch (err) {
      console.warn('[Firebase] Inicialización de listeners:', err);
    }
  }

  initFirestoreSync();

  /* ── Form submit con Firebase Firestore ────────────────── */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validaciones básicas
    let valid = true;
    const required = ['f-name', 'f-email', 'f-service', 'f-date', 'f-time'];
    required.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !el.value.trim()) {
        if (el) el.classList.add('error');
        valid = false;
      } else {
        el.classList.remove('error');
      }
    });
    if (!valid) return;

    const payload = {
      name:    document.getElementById('f-name').value.trim(),
      email:   document.getElementById('f-email').value.trim(),
      phone:   document.getElementById('f-phone').value.trim(),
      service: document.getElementById('f-service').value,
      date:    document.getElementById('f-date').value,
      time:    document.getElementById('f-time').value,
      notes:   document.getElementById('f-notes').value.trim()
    };

    // Deshabilitar botón durante el envío
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Guardando reserva…';

    let ok = false;

    try {
      if (window.db) {
        // Guardar directamente en la colección 'appointments' de Firestore
        await db.collection('appointments').add({
          name: payload.name,
          email: payload.email,
          phone: payload.phone || '',
          service: payload.service,
          date: payload.date,
          time: payload.time,
          notes: payload.notes || '',
          status: 'pending',
          clinical_notes: '',
          next_appointment_notes: '',
          created_at: new Date().toISOString()
        });
        ok = true;
      } else {
        // Fallback local en memoria si aún no configuró Firebase
        bookedAppointments.push({
          id: 'temp_' + Date.now(),
          ...payload,
          status: 'pending'
        });
        renderAvailableSlots();
        updateModalTimeOptions();
        ok = true;
      }
    } catch (err) {
      console.error('[Firebase] Error al guardar reserva:', err);
      alert('Hubo un inconveniente al guardar la reserva en Firebase: ' + (err.message || 'Verificá tu conexión'));
    }

    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Confirmar Reserva';

    if (ok) {
      form.style.display = 'none';
      successMsg.textContent = `¡Gracias, ${payload.name}! Tu solicitud de turno para el ${formatDate(payload.date)} a las ${payload.time} fue recibida correctamente. Nos comunicaremos contigo pronto.`;
      successDiv.style.display = 'flex';
      form.reset();
    }
  });
      form.style.display = 'none';
      successMsg.textContent = `¡Gracias, ${payload.name}! Tu solicitud de turno para el ${formatDate(payload.date)} fue recibida. Te contactaremos pronto.`;
      successDiv.style.display = 'flex';
      form.reset();
    } else {
      alert('Ocurrió un error al enviar la reserva. Por favor intentá nuevamente.');
    }
  });

  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${parseInt(d)} de ${months[parseInt(m)-1]} de ${y}`;
  }

  /* ────────────────────────────────────────────────────────
     SCROLL-CONTROLLED VIDEO / CANVAS ENGINE
     Draws video frames on canvas as user scrolls.
     Falls back to HTML5 video scrubbing if frames not found.
  ──────────────────────────────────────────────────────── */
  const ctx         = canvas.getContext('2d');
  const TOTAL       = 192;
  const frames      = new Array(TOTAL + 1);
  let usingCanvas   = false;
  let currentFrame  = 1;
  let targetProgress  = 0;
  let currentProgress = 0;
  const EASE = 0.09;

  function framePath(n) {
    return `assets/frames/frame_${String(n).padStart(4,'0')}.jpg`;
  }

  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    if (usingCanvas) renderFrame(currentFrame);
  }
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();

  function renderFrame(idx) {
    const img = frames[idx];
    if (!img || !img.complete || !img.naturalWidth) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const x = (cw - iw * scale) / 2;
    const y = (ch - ih * scale) / 2;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, x, y, iw * scale, ih * scale);
  }

  // Smooth animation loop
  function tick() {
    const diff = targetProgress - currentProgress;
    if (Math.abs(diff) > 0.0002) {
      currentProgress += diff * EASE;
    } else {
      currentProgress = targetProgress;
    }

    if (usingCanvas) {
      const fi = Math.min(TOTAL, Math.max(1, Math.round(currentProgress * (TOTAL - 1) + 1)));
      if (fi !== currentFrame) {
        currentFrame = fi;
        renderFrame(fi);
      }
    } else if (videoEl.duration && !isNaN(videoEl.duration)) {
      videoEl.currentTime = currentProgress * videoEl.duration;
    }

    requestAnimationFrame(tick);
  }

  function getScrollProgress() {
    const servicesSection = document.getElementById('servicios');
    if (servicesSection) {
      // El video completa todos sus fotogramas antes de llegar a "Odontología Integral para Cada Sonrisa"
      const maxScroll = Math.max(1, servicesSection.offsetTop - (window.innerHeight * 0.25));
      return Math.min(1, Math.max(0, window.scrollY / maxScroll));
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }

  // Load frames in chunks (non-blocking)
  async function loadFrames(first) {
    frames[1] = first;
    const CHUNK = 12;
    for (let i = 2; i <= TOTAL; i += CHUNK) {
      await Promise.all(
        Array.from({ length: Math.min(CHUNK, TOTAL - i + 1) }, (_, k) => {
          const n = i + k;
          return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => { frames[n] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = framePath(n);
          });
        })
      );
    }
  }

  // Boot: try canvas frames first
  const probe = new Image();
  probe.src = framePath(1);
  probe.onload = () => {
    usingCanvas = true;
    canvas.style.display = 'block';
    videoEl.style.display = 'none';
    resizeCanvas();
    renderFrame(1);
    loadFrames(probe);
    requestAnimationFrame(tick);
  };
  probe.onerror = () => {
    // Fallback to video scrubbing
    usingCanvas = false;
    canvas.style.display = 'none';
    videoEl.style.display = 'block';
    videoEl.load();
    videoEl.addEventListener('play', e => { e.preventDefault(); videoEl.pause(); }, { once: false });
    videoEl.addEventListener('loadedmetadata', () => requestAnimationFrame(tick), { once: true });
  };

});
