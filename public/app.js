const firebaseConfig = {
    apiKey: "AIzaSyC-b9KS5OZ4ckOSEfAyLFm9QQuZqM9teO4",
    authDomain: "print-foto-7409e.firebaseapp.com",
    projectId: "print-foto-7409e",
    storageBucket: "print-foto-7409e.firebasestorage.app",
    messagingSenderId: "103953800507",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

let messaging = null;
if (firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
}

let userFcmToken = null;

// Logica pentru instalarea PWA
let deferredPrompt;

// Verificăm dacă aplicația este deja instalată (Standalone)
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.getElementById('installBanner');
    if (banner && !isStandalone) banner.style.display = 'block';
});

// Pe iPhone arătăm bannerul imediat pentru că nu avem evenimentul de 'beforeinstallprompt'
if (isIOS && !isStandalone) {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'block';
}

// Dacă aplicația este deja instalată, ascundem bannerul
window.addEventListener('appinstalled', () => {
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
    deferredPrompt = null;
});

const btnInstall = document.getElementById('btnInstall');
if (btnInstall) {
    btnInstall.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('Utilizatorul a acceptat instalarea');
            }
            deferredPrompt = null;
        } else if (isIOS) {
            alert("Pentru iPhone: Apasă pe butonul de 'Share' (pătratul cu săgeată sus) și alege 'Add to Home Screen' (Adaugă pe ecranul principal).");
        }
        
        // Cerem oricum permisiunea de notificări la click pe buton
        if (messaging) {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    messaging.getToken({ vapidKey: 'BFyVZAtBW0bvXh423sYmB9JxjSpB2bV_23HrGsj5vtOI66PT9BGKF3wiGRpJX43LrYSRkqzBbcIy8vgtHFRawQM' })
                        .then(token => { userFcmToken = token; })
                        .catch(err => console.log("Eroare token:", err));
                }
            });
        }
        document.getElementById('installBanner').style.display = 'none';
    });
}

let filesDataStore = { "10x15":[], "13x18":[], "A4":[] };
let PRICE_MAP = { "10x15": 0.9, "13x18": 1.5, "A4": 3.0 };
let activeFormatTarget = '';
let cropperInstance;
let resolveCropCallback;

// Sincronizare prețuri
db.collection("settings").doc("prices").onSnapshot((doc) => {
    if (doc.exists) {
        const data = doc.data();
        PRICE_MAP["10x15"] = data.p10;
        PRICE_MAP["13x18"] = data.p13;
        PRICE_MAP["A4"] = data.pA4;

        // Funcție pentru formatare preț cu virgulă (ex: 0,90 lei)
        const formatP = (val) => val.toFixed(2).replace('.', ',');

        // Actualizare Prețuri Noi
        const updateNewPrice = (id, val) => {
            const txt = formatP(val) + " lei/poză";
            if(document.getElementById('lbl-' + id)) document.getElementById('lbl-' + id).innerText = txt;
            if(document.getElementById('info-lbl-' + id)) document.getElementById('info-lbl-' + id).innerText = txt;
        };
        
        updateNewPrice('p10', data.p10);
        updateNewPrice('p13', data.p13);
        updateNewPrice('pA4', data.pA4);

        // Actualizare Prețuri Vechi (Tăiate) - Se ascund dacă sunt 0
        const updateOldPrice = (id, val) => {
            const el = document.getElementById('old-' + id);
            const infoEl = document.getElementById('info-old-' + id);
            const txt = val > 0 ? formatP(val) + " lei" : "";
            if(el) { el.innerText = txt; el.style.display = val > 0 ? "block" : "none"; }
            if(infoEl) { infoEl.innerText = txt; infoEl.style.display = val > 0 ? "inline" : "none"; }
        };

        updateOldPrice('p10', data.old_p10);
        updateOldPrice('p13', data.old_p13);
        updateOldPrice('pA4', data.old_pA4);

        // Sincronizare Banner Promoție
        const banner1 = document.getElementById('promo-banner');
        const banner2 = document.getElementById('promo-banner-2');
        if (data.promoDate) {
            const msg = "PROMOȚIE VALABILĂ PÂNĂ LA: " + data.promoDate;
            if(banner1) { banner1.innerText = msg; banner1.style.display = "block"; }
            if(banner2) { banner2.innerText = msg; banner2.style.display = "block"; }
        } else {
            if(banner1) banner1.style.display = "none";
            if(banner2) banner2.style.display = "none";
        }

        refreshUIState();
    }
});

function openFileInput(format) {
    activeFormatTarget = format;
    document.getElementById('fileInput').click();
}

document.getElementById('fileInput').onchange = async (e) => {
    const files = Array.from(e.target.files);
    for(let file of files) {
        const blob = await initiateCropUI(file);
        if(blob) {
            filesDataStore[activeFormatTarget].push({ blob, originalName: file.name });
            refreshUIState();
        }
    }
    e.target.value = "";
};

function initiateCropUI(file) {
    return new Promise(resolve => {
        resolveCropCallback = resolve;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.getElementById('cropImg');
            img.src = e.target.result;
            document.getElementById('cropModal').style.display = 'flex';
            let aspect = activeFormatTarget === '10x15' ? 10/15 : (activeFormatTarget === '13x18' ? 13/18 : 210/297);
            if(cropperInstance) cropperInstance.destroy();
            cropperInstance = new Cropper(img, { aspectRatio: aspect, viewMode: 1 });
        };
        reader.readAsDataURL(file);
    });
}

function executeConfirmCrop() {
    if (!cropperInstance) return;
    
    cropperInstance.getCroppedCanvas({ maxWidth: 2500, maxHeight: 2500, imageSmoothingQuality: 'high' }).toBlob(blob => {
        resolveCropCallback(blob);
        closeCropModal();
    }, 'image/jpeg', 0.9);
}

function closeCropModal() {
    document.getElementById('cropModal').style.display = 'none';
    if(resolveCropCallback) resolveCropCallback(null);
}

function refreshUIState() {
    let total = 0, count = 0;
    for(let f in filesDataStore) {
        const grid = document.getElementById(`grid-${f}`);
        const head = document.getElementById(`head-${f}`);
        grid.innerHTML = "";
        if(filesDataStore[f].length > 0) {
            head.style.display = "block";
            filesDataStore[f].forEach((item, i) => {
                const url = URL.createObjectURL(item.blob);
                grid.innerHTML += `<div class="thumb-box"><img src="${url}"><button class="remove-btn" onclick="deletePhoto('${f}', ${i})">×</button></div>`;
            });
        } else { head.style.display = "none"; }
        total += filesDataStore[f].length * PRICE_MAP[f];
        count += filesDataStore[f].length;
    }
    document.getElementById('totalPrice').innerText = total.toFixed(2) + " LEI";
    document.getElementById('totalCount').innerText = count;
    document.getElementById('s10').innerText = filesDataStore["10x15"].length;
    document.getElementById('s13').innerText = filesDataStore["13x18"].length;
    document.getElementById('sA4').innerText = filesDataStore["A4"].length;
}

function deletePhoto(f, i) {
    filesDataStore[f].splice(i, 1);
    refreshUIState();
}

async function handleOrderSubmission() {
    const name = document.getElementById('name').value;
    const phone = document.getElementById('phone').value;
    if(!name || !phone) return alert("Completează numele și telefonul!");
    
    const all = [];
    for(let f in filesDataStore) filesDataStore[f].forEach(p => all.push({...p, f}));
    if(all.length === 0) return alert("Adaugă măcar o poză!");

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    document.getElementById('uploadUI').style.display = "block";
    document.getElementById('upFill').style.width = "0%";
    document.getElementById('upPercent').innerText = "0%";
    
    const orderId = "TM-" + Date.now();
    
    // Calculăm dimensiunea totală a tuturor fișierelor pentru un progres real 1-100%
    const totalBytes = all.reduce((acc, p) => acc + (p.blob.size || 0), 0);
    let uploadedBytes = 0;

    try {
        for(let p of all) {
            const ref = storage.ref(`comenzi/${orderId}/${p.f}_${Date.now()}_${p.originalName}`);
            const uploadTask = ref.put(p.blob);
            
            let lastFileBytes = 0;

            // Monitorizăm progresul la nivel de bytes pentru fiecare fișier
            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const currentFileBytes = snapshot.bytesTransferred;
                        const delta = currentFileBytes - lastFileBytes;
                        uploadedBytes += delta;
                        lastFileBytes = currentFileBytes;

                        const overallPct = totalBytes > 0 ? Math.floor((uploadedBytes / totalBytes) * 100) : 100;
                        document.getElementById('upFill').style.width = overallPct + "%";
                        document.getElementById('upPercent').innerText = overallPct + "%";
                    },
                    (error) => reject(error),
                    () => resolve()
                );
            });
        }
        await db.collection("comenzi").doc(orderId).set({
            name, phone, note: document.getElementById('note').value,
            status: "primită", timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            notificationToken: userFcmToken,
            details: { n10: filesDataStore["10x15"].length, n13: filesDataStore["13x18"].length, nA4: filesDataStore["A4"].length }
        });
        showSuccess(orderId, name, phone);
    } catch (e) {
        alert("Eroare: " + e.message);
        btn.disabled = false;
    }
}

function showSuccess(id, n, p) {
    document.getElementById('mainOrderCard').style.display = "none";
    document.getElementById('orderSuccess').style.display = "block";
    document.getElementById('displayOrderId').innerText = "ID: " + id;
    document.getElementById('resName').innerText = n;
    document.getElementById('resPhone').innerText = p;
    document.getElementById('res10').innerText = filesDataStore["10x15"].length;
    document.getElementById('res13').innerText = filesDataStore["13x18"].length;
    document.getElementById('resA4').innerText = filesDataStore["A4"].length;
    window.scrollTo(0,0);

    // Generare link de urmărire pentru client
    const trackUrl = window.location.origin + "/track.html?id=" + id;
    document.getElementById('shareableLink').value = trackUrl;

    // Ascultă live dacă adminul (tu) schimbă statusul în baza de date
    db.collection("comenzi").doc(id).onSnapshot((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const currentStatus = data.status;
            const pill = document.querySelector('.status-pill');
            if (pill) {
                pill.innerText = currentStatus.toUpperCase();
                // Schimbăm culorile în funcție de status
                pill.style.background = 'rgba(255,255,255,0.1)';
                if (currentStatus === 'primită') pill.style.color = 'var(--primary)';
                if (currentStatus === 'acceptată') pill.style.color = '#00f2a1';
                if (currentStatus === 'în lucru') pill.style.color = '#7000ff';
                if (currentStatus === 'în așteptare') pill.style.color = '#f7b731';
                if (currentStatus === 'finalizată') pill.style.color = 'var(--success)';
            }

            // Afișăm motivul dacă este în așteptare
            let reasonDiv = document.getElementById('hold-reason-display');
            if (currentStatus === 'în așteptare' && data.onHoldReason) {
                if (!reasonDiv) {
                    reasonDiv = document.createElement('div');
                    reasonDiv.id = 'hold-reason-display';
                    reasonDiv.style = "margin-top:10px; padding:10px; background:rgba(247,183,49,0.1); border:1px solid #f7b731; border-radius:10px; font-size:12px; color:#f7b731;";
                    pill.parentNode.appendChild(reasonDiv);
                }
                reasonDiv.innerHTML = `<b>NOTĂ:</b> ${data.onHoldReason}`;
            } else if (reasonDiv) {
                reasonDiv.remove();
            }
        }
    });
}

function copyTrackLink() {
    const copyText = document.getElementById("shareableLink");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
    alert("Link-ul a fost copiat în clipboard!");
}

// Prevenirea închiderii accidentale a paginii dacă există poze în listă
window.addEventListener('beforeunload', function (e) {
    const hasFiles = Object.values(filesDataStore).some(arr => arr.length > 0);
    if (hasFiles) {
        // Standard conform specificațiilor moderne
        e.preventDefault();
        // Mesajul personalizat nu mai este afișat de browserele noi, 
        // dar setarea returnValue activează dialogul browserului.
        e.returnValue = 'Ai poze nesalvate! Sigur vrei să pleci?';
    }
});

console.log("App script loaded successfully!");