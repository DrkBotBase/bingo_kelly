let deferredPrompt;
let installBanner = null;

const style = document.createElement('style');
style.textContent = `
  @keyframes slideUpBingo {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideDownBingo {
    from { transform: translate(-50%, -100%); opacity: 0; }
    to { transform: translate(-50%, 0); opacity: 1; }
  }

  .bingo-pwa-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1f2937;
    padding: 20px 25px;
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -10px 30px rgba(0,0,0,0.3);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    animation: slideUpBingo 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    border-top: 2px solid #e2ed3a;
  }

  .bingo-banner-content {
    display: flex;
    align-items: center;
    gap: 18px;
  }

  .bingo-banner-icon-pre {
    font-size: 22px;
    color: #ffffff;
    background: #ed3a4aff;
    width: 50px;
    height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    box-shadow: 0 4px 10px rgba(237,58,97,0.3);
  }

  .bingo-banner-text-block {
    display: flex;
    flex-direction: column;
  }

  .bingo-banner-title {
    color: #ffffff;
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 2px;
  }

  .bingo-banner-subtitle {
    color: #9ca3af;
    font-size: 13px;
    font-weight: 400;
  }

  .bingo-action-btn {
    background: #ed3a4aff;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(237,58,97,0.3);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .bingo-action-btn:hover {
    background: #6d28d9;
    transform: translateY(-1px);
  }

  .bingo-action-btn:active {
    transform: translateY(1px) scale(0.98);
  }

  .bingo-status-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 50px;
    color: white;
    font-weight: 600;
    font-size: 14px;
    z-index: 10001;
    box-shadow: 0 6px 20px rgba(0,0,0,0.2);
    animation: slideDownBingo 0.4s forwards;
    display: flex;
    align-items: center;
    gap: 10px;
  }
`;
document.head.appendChild(style);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/js/service-worker.js');
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showBingoUpdateBanner();
          }
        });
      });
      
    } catch (error) {
      console.error('❌ Error SW Bingo:', error);
    }
  });
}

function showBingoUpdateBanner() {
  const updateDiv = document.createElement('div');
  updateDiv.className = 'bingo-pwa-banner';
  updateDiv.innerHTML = `
    <div class="bingo-banner-content">
      <div class="bingo-banner-icon-pre"><i class="fas fa-gift"></i></div>
      <div class="bingo-banner-text-block">
        <div class="bingo-banner-title">¡Nuevos premios listos!</div>
        <div class="bingo-banner-subtitle">Actualiza para ver las novedades del Bingo.</div>
      </div>
    </div>
    <button class="bingo-action-btn" onclick="location.reload()">¡Actualizar!</button>
  `;
  document.body.appendChild(updateDiv);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  if (!installBanner) {
    createBingoInstallBanner();
  }
});

function createBingoInstallBanner() {
  installBanner = document.createElement('div');
  installBanner.className = 'bingo-pwa-banner';
  installBanner.innerHTML = `
    <div class="bingo-banner-content">
      <div class="bingo-banner-icon-pre">
        <i class="fas fa-ticket-alt"></i> </div>
      <div class="bingo-banner-text-block">
        <div class="bingo-banner-title">¡Juega mejor al Bingo!</div>
        <div class="bingo-banner-subtitle">Agrega a tu pantalla para una experiencia total.</div>
      </div>
    </div>
    <button class="bingo-action-btn" id="bingo-confirm-install">Instalar App</button>
  `;
  
  document.body.appendChild(installBanner);
  
  document.getElementById('bingo-confirm-install').addEventListener('click', installBingoPWA);
}

async function installBingoPWA() {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  
  const { outcome } = await deferredPrompt.userChoice;
  
  if (outcome === 'accepted') {
    if (installBanner) {
      installBanner.remove();
      installBanner = null;
    }
  }
  
  deferredPrompt = null;
}

window.addEventListener('appinstalled', (e) => {
  if (installBanner) {
    installBanner.remove();
    installBanner = null;
  }
});

window.addEventListener('online', () => {
  showBingoStatus('online', '¡Conexión cantada! Volvemos a jugar.');
});

window.addEventListener('offline', () => {
  showBingoStatus('offline', 'Buscando señal... Modo offline activado.');
});

function showBingoStatus(type, message) {
  const existingToasts = document.querySelectorAll('.bingo-status-toast');
  existingToasts.forEach(toast => toast.remove());

  const statusDiv = document.createElement('div');
  statusDiv.className = `bingo-status-toast`;
  
  if (type === 'online') {
    statusDiv.style.background = '#10b981';
  } else {
    statusDiv.style.background = '#4b5563';
  }
  
  const icon = type === 'online' ? 'fa-check-circle' : 'fa-wifi-slash';
  statusDiv.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  
  document.body.appendChild(statusDiv);
  
  setTimeout(() => {
    statusDiv.style.opacity = '0';
    statusDiv.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    statusDiv.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => {
      statusDiv.remove();
    }, 500);
  }, 4000);
}
