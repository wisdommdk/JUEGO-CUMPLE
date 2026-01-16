document.addEventListener('DOMContentLoaded', () => {
    // State
    let slidesData = [];
    let currentSlideIndex = 0;
    let totalScore = 0;
    let appConfig = {};
    let tempFiles = [];

    // DOM Elements
    const dom = {
        container: document.getElementById('presentation-container'),
        title: document.getElementById('slide-title'),
        displayQuota1: document.getElementById('display-quota-1'),
        displayQuota3: document.getElementById('display-quota-3'),
        displayCurrent: document.getElementById('display-current'),
        // Inputs & Validate Btn removed -- accessed via inline edit
        btnPrev: document.getElementById('btn-prev'),
        btnNext: document.getElementById('btn-next'),
        indicator: document.getElementById('slide-indicator'),
        mainScoreDisplay: document.getElementById('display-total-score-main'),
        displayDelValle: document.getElementById('display-del-valle'),
        displayBogota: document.getElementById('display-bogota'),
        displayDiffRow: document.getElementById('diff-row'),
        displayDiffValue: document.getElementById('display-diff-value'),
        audioPlayer: document.getElementById('audio-fanfare'),
        // Setup Screen Elements
        setupScreen: document.getElementById('setup-screen'),
        fileInput: document.getElementById('file-upload'),
        fileList: document.getElementById('file-list'),
        configTitle: document.getElementById('config-title'),
        configDelVallePoints: document.getElementById('config-del-valle-points'),
        configBogotaPoints: document.getElementById('config-bogota-points'),
        btnStartCustom: document.getElementById('btn-start-custom'),
        btnRestart: document.getElementById('btn-restart')
    };

    // --- PERSISTENCE (IndexedDB) ---
    // Using IndexedDB to store blobs (images) + metadata
    const DB_NAME = 'PresentationDB';
    const DB_VERSION = 2; // Incremented version
    let db = null; // Declare explicitly at top level scope

    // --- STAT NAMES CONFIG ---
    const STAT_NAMES = [
        "QSH", "FHS", "GI/GIWC", "GBS", "CASH", 
        "ASSETRES", "VSD", "STP", "WDAH", "QTSM", "GIBY", 
        "BIS/BISS", "NNCF", "NAMF", "NFSMC", "PCTRISFNC", "PDC"
    ];

    // --- SOUNDS ---
    const slotSound = new Audio('assets/sounds/slot-numbers.wav');
    slotSound.loop = true;
    const winSound = new Audio('assets/sounds/slot-win.mp3');

    // Helper to update comparative scores and difference
    function updateComparativeDisplay(delValle, bogota) {
        dom.displayDelValle.innerText = delValle;
        dom.displayBogota.innerText = bogota;
        
        const dvVal = parseInt(delValle) || 0;
        const bogVal = parseInt(bogota) || 0;
        const diff = bogVal - dvVal; // Bog - DV
        
        dom.displayDiffValue.innerText = (diff > 0 ? "+" : "") + diff;
        dom.displayDiffRow.style.display = 'flex'; // Show it
        
        // Colors: Positive (Red/Danger), Negative (Green/Success)
        // If 0, maybe white?
        if (diff > 0) {
            dom.displayDiffValue.style.color = "var(--danger)";
        } else if (diff < 0) {
            dom.displayDiffValue.style.color = "var(--success)";
        } else {
            dom.displayDiffValue.style.color = "#fff";
        }
    }

    // Initialize - Now waits for user
    initSetup();
    renderStatsList(); // Render empty or predefined list on load

    async function openDB() {
        // If we have a db instance, verify it's not closed
        if (db) return db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => {
                console.error("DB Open Error", e);
                reject("Error opening DB");
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                
                // Add error handler for the connection itself
                db.onerror = (event) => {
                    console.error("Database error: " + event.target.errorCode);
                };

                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (db.objectStoreNames.contains('slides')) {
                    db.deleteObjectStore('slides'); // Re-create on schema update
                }
                db.createObjectStore('slides', { keyPath: 'id' });
            };
        });
    }

    async function checkSavedSession() {
        try {
            if (!db) await openDB();
        } catch(e) {
            console.error("Cannot open DB for checkSavedSession", e);
            return false;
        }

        return new Promise((resolve) => {
            try {
                const tx = db.transaction('slides', 'readonly');
                const store = tx.objectStore('slides');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    const savedSlides = request.result;
                    if (savedSlides && savedSlides.length > 0) {
                        try {
                            // Restore slides (Blob is stored in DB)
                            slidesData = savedSlides.map(s => {
                                // Double check if blob exists
                                if (!s.blob) throw new Error("Missing blob in saved slide");
                                
                                // Legacy Data Migration: Remove index from title if present
                                let cleanTitle = s.title || "";
                                cleanTitle = cleanTitle.replace(/ - \d+$/, "");

                                return {
                                    ...s,
                                    title: cleanTitle,
                                    image: URL.createObjectURL(s.blob) 
                                };
                            });
                            
                            // Immediately save sanitized data back to DB to make it permanent
                            saveAllSlidesToDB(slidesData).catch(e => console.log("Migration save failed", e));
                            
                            // Recalculate Total Score
                            updateTotalScore();

                            // Restore Extra Scores
                            const savedDV = localStorage.getItem('pres_delVallePoints') || "0";
                            const savedBog = localStorage.getItem('pres_bogotaPoints') || "0";
                            updateComparativeDisplay(savedDV, savedBog);

                            // Restore basics and start
                            appConfig = { soundEffect: "assets/sounds/Fans Cheering.mp3" };
                            dom.audioPlayer.src = encodeURI(appConfig.soundEffect);
                            dom.setupScreen.classList.add('hidden');
                            loadSlide(0);
                            resolve(true);
                        } catch (err) {
                            console.error("Error reconstituting slides from DB", err);
                            // Corrupt data?
                            resolve(false);
                        }
                    } else {
                        resolve(false);
                    }
                };
                request.onerror = (e) => {
                    console.error("Error reading slides from DB", e);
                    resolve(false);
                };
            } catch (err) {
                console.error("Transaction error in checkSavedSession", err);
                resolve(false);
            }
        });
    }


    async function saveAllSlidesToDB(slides) {
        // Ensure DB is open
        if (!db) await openDB();
        
        return new Promise((resolve, reject) => {
            const tx = db.transaction('slides', 'readwrite');
            const store = tx.objectStore('slides');
            
            // Transaction flow
            tx.oncomplete = () => {
                console.log("Persistence: All slides saved successfully.");
                resolve();
            };
            tx.onerror = (e) => {
                console.error("Persistence Error:", e);
                reject(e);
            };

            // Operations
            // IMPORTANT: Don't just clear, this is a full rewrite
            try {
                store.clear(); 
                slides.forEach(slide => {
                    const slideToStore = { 
                        id: slide.id,
                        title: slide.title,
                        blob: slide.blob, // File object is serializable in IDB
                        quota1: slide.quota1,
                        quota3: slide.quota3,
                        current: slide.current,
                        points: slide.points
                    };
                    store.put(slideToStore);
                });
            } catch (err) {
                console.error("Error during store.put", err);
                // The tx.onerror will catch this too, but logging here helps
            }
        });
    }

    async function updateSlideInDB(slide) {
        if(!db) await openDB();
        // Fire and forget, but log error
        const tx = db.transaction('slides', 'readwrite');
        const store = tx.objectStore('slides');
        const slideToStore = { 
            id: slide.id,
            title: slide.title,
            blob: slide.blob,
            quota1: slide.quota1,
            quota3: slide.quota3,
            current: slide.current,
            points: slide.points
        };
        store.put(slideToStore);
    }
    
    // Clear data
    async function clearProgress() {
        if(confirm("¿Borrar todos los datos guardados y las imágenes?")) {
            if (!db) await openDB();
            const tx = db.transaction('slides', 'readwrite');
            tx.objectStore('slides').clear();
            tx.oncomplete = () => {
                alert("Datos borrados. Inicia una nueva sesión.");
                location.reload();
            };
        }
    }

    function initSetup() {
        setupEventListeners();
        enableStatBoxEditing(); // Add inline editing capability
        
        // Restore config inputs if available
        if(dom.configDelVallePoints) dom.configDelVallePoints.value = localStorage.getItem('pres_delVallePoints') || '';
        if(dom.configBogotaPoints) dom.configBogotaPoints.value = localStorage.getItem('pres_bogotaPoints') || '';
        
        // Check for total session restore (images included)
        checkSavedSession();
    }

    // --- SETUP LOGIC ---
    function handleFileSelect(e) {
        if (e.target.files && e.target.files.length > 0) {
            tempFiles = Array.from(e.target.files);
            dom.fileList.innerText = `${tempFiles.length} archivos seleccionados.`;
            dom.btnStartCustom.disabled = false;
        } else {
            dom.fileList.innerText = "Ningún archivo seleccionado";
            dom.btnStartCustom.disabled = true;
        }
    }

    async function startCustomPresentation() {
        if (tempFiles.length === 0) return;
        
        // Show loading state
        dom.btnStartCustom.innerText = "Guardando...";
        dom.btnStartCustom.disabled = true;

        const customTitleInput = dom.configTitle.value.trim();
        
        // Capture extra config
        const delVallePoints = dom.configDelVallePoints.value.trim() || "0";
        const bogotaPoints = dom.configBogotaPoints.value.trim() || "0";
        
        // Persist extra config simply in localStorage for now
        localStorage.setItem('pres_delVallePoints', delVallePoints);
        localStorage.setItem('pres_bogotaPoints', bogotaPoints);

        // Update displays immediately
        updateComparativeDisplay(delVallePoints, bogotaPoints);

        // Sort files to ensure sequence matches mapping
        // Using numeric sort so Page_10 comes after Page_9, not Page_1
        tempFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        
        // New Session with FRESH files
        slidesData = tempFiles.map((file, index) => {
            // Determine Stat Name (fallback if no custom title, or logic for referencing)
            let statName = "";
            const match = file.name.match(/Page_(\d+)/i);
            if (match && match[1]) {
                const pageNum = parseInt(match[1], 10);
                if (pageNum >= 1 && pageNum <= STAT_NAMES.length) {
                    statName = STAT_NAMES[pageNum - 1];
                }
            } else {
                if (index < STAT_NAMES.length) {
                    statName = STAT_NAMES[index];
                }
            }

            // USER REQUEST: If Custom Title is provided, use it for ALL slides.
            // If empty, fallback to Stat Name.
            const displayTitle = customTitleInput ? customTitleInput : (statName || `Slide ${index + 1}`);

            return {
                id: index + 1,
                title: displayTitle, 
                image: URL.createObjectURL(file), // Create blob URL for viewing
                blob: file, // Store File for DB
                quota1: 0,
                quota3: 0,
                current: 0,
                points: 0
            };
        });
        
        // Initial Full Save (Images + Data)
        // We await this to ensure data is safe before starting
        try {
            await saveAllSlidesToDB(slidesData);
        } catch (err) {
            console.error("Critical: Failed to save session.", err);
            alert("Advertencia: No se pudo guardar la sesión automáticamente. Si recargas la página, perderás el progreso.");
        }

        // Use default config for app settings if needed
        appConfig = { soundEffect: "assets/sounds/Fans Cheering.mp3" };
        dom.audioPlayer.src = encodeURI(appConfig.soundEffect);
        
        // Calc initial score
        updateTotalScore();

        // Hide setup, show pres
        dom.setupScreen.classList.add('hidden');
        loadSlide(0);
    }

    function showSetup() {
        dom.setupScreen.classList.remove('hidden');
    }

    // --- PRESENTATION LOGIC ---

    function loadSlide(index) {
        if (!slidesData || slidesData.length === 0) return;
        
        // Safety check for bounds
        if (index < 0 || index >= slidesData.length) return;

        const slide = slidesData[index];
        if (!slide) return;

        currentSlideIndex = index;

        // Update UI
        dom.title.innerText = slide.title;
        dom.container.style.backgroundImage = `url('${slide.image}')`;
        
        // Reset display values
        dom.displayQuota1.innerText = slide.quota1 || 0;
        dom.displayQuota3.innerText = slide.quota3 || 0;
        dom.displayCurrent.innerText = slide.current || 0;
        
        // Populate inputs with current values (Inputs removed, so skipping this)
        // dom.inputQuota1.value = slide.quota1 || 0;
        // dom.inputQuota3.value = slide.quota3 || 0;
        // dom.inputCurrent.value = slide.current || 0;
        
        // Update Indicator
        dom.indicator.innerText = `${index + 1} / ${slidesData.length}`;

        // Reset Styles
        dom.displayCurrent.classList.remove('success');

        // Update Active Stat in Grid
        updateActiveStat(index);
        updateStatsMarkers();
    }
    
    function renderStatsList() {
        const grid = document.getElementById('stats-grid');
        if(!grid) return;
        
        grid.innerHTML = ''; // Clear
        
        STAT_NAMES.forEach((name, index) => {
            const div = document.createElement('div');
            div.className = 'stat-item';
            
            // Create structure for markers
            const markers = document.createElement('div');
            markers.className = 'stat-markers';
            markers.style.height = '1.5rem'; // Reserve space
            markers.id = `markers-${index}`;
            
            const nameSpan = document.createElement('span');
            nameSpan.innerText = name;

            div.appendChild(markers);
            div.appendChild(nameSpan);
            
            div.dataset.index = index;
            
            // Add click interaction
            div.addEventListener('click', () => {
                loadSlide(index);
            });

            grid.appendChild(div);
        });
    }

    function updateStatsMarkers() {
        if (!slidesData) return;
        
        slidesData.forEach((slide, index) => {
            const markerDiv = document.getElementById(`markers-${index}`);
            if (markerDiv) {
                const points = slide.points || 0;
                if (points >= 3) {
                     markerDiv.innerText = "✅✅✅";
                } else if (points >= 1) {
                     markerDiv.innerText = "✅";
                } else {
                     markerDiv.innerText = "";
                }
            }
        });
    }

    function updateActiveStat(activeIndex) {
        const items = document.querySelectorAll('.stat-item');
        items.forEach(item => {
            item.classList.remove('active');
            // Assuming 1:1 mapping between slides and these stats
            if(parseInt(item.dataset.index) === activeIndex) {
                 item.classList.add('active');
            }
        });
    }

    function nextSlide() {
        if (currentSlideIndex < slidesData.length - 1) {
            loadSlide(currentSlideIndex + 1);
        }
    }

    function prevSlide() {
        if (currentSlideIndex > 0) {
            loadSlide(currentSlideIndex - 1);
        }
    }


    // Enable click-to-edit behavior for stats
    function enableStatBoxEditing() {
        // Generic handler for making a stat box interactive
        const setupBox = (element, fieldName) => {
            if (!element) return;
            // Ensure parent container is reachable for styling cursor
            element.parentElement.style.cursor = "pointer";
            element.parentElement.title = "Click to Edit";
            
            element.parentElement.addEventListener('click', () => {
                 // Avoid re-creating if input already exists
                 if (element.querySelector('input')) return;
                 
                 const currentValue = element.innerText;
                 const input = document.createElement('input');
                 input.type = 'number';
                 input.value = currentValue;
                 input.className = 'inline-stat-input';
                 // Styling in JS or rely on global CSS
                 input.style.width = "80px";
                 input.style.fontSize = "inherit";
                 input.style.color = "#ffffff";
                 input.style.backgroundColor = "rgba(0,0,0,0.5)"; 
                 input.style.textAlign = "center";
                 input.style.borderRadius = "5px";
                 input.style.border = "none";
                 input.style.padding = "5px";

                 element.innerHTML = '';
                 element.appendChild(input);
                 input.focus();
                 input.select(); /* highlight all */

                 // Save on Blur or Enter
                 const save = () => {
                     const newValue = parseInt(input.value) || 0;
                     element.innerText = newValue; // revert to text
                     // Trigger logic
                     updateStatValue(fieldName, newValue);
                 };

                 input.addEventListener('blur', save);
                 input.addEventListener('keydown', (e) => {
                     if (e.key === 'Enter') {
                         input.blur();
                     }
                 });
                 
                 // Prevent click from bubbling up and restarting edit immediately
                 input.addEventListener('click', (e) => e.stopPropagation());
            });
        };

        setupBox(dom.displayQuota1, 'quota1');
        setupBox(dom.displayQuota3, 'quota3');
        setupBox(dom.displayCurrent, 'current');
    }

    // Logic equivalent to old Validate Button
    function updateStatValue(field, value) {
        if (!slidesData[currentSlideIndex]) return;
        
        slidesData[currentSlideIndex][field] = value;
        
        // If "current" changed, we should re-run validation logic
        if (field === 'current') {
            validateResult();
        } else {
             // Just save if quota changed
             updateSlideInDB(slidesData[currentSlideIndex]);
        }
    }

    // Validate Result Logic (Refactored to read from data, not inputs)
    function validateResult() {
        if (!slidesData || slidesData.length === 0) return;
        
        const slide = slidesData[currentSlideIndex];
        const current = slide.current;
        const quota1 = slide.quota1;
        const quota3 = slide.quota3;
        
        // Calculate Points using same logic
        let points = 0;
        if (current >= quota3 && quota3 > 0) {
            points = 3;
        } else if (current >= quota1 && quota1 > 0) {
            points = 1;
        }

        // Get previous points
        const previousPoints = slide.points || 0;

        // Update Data Model
        slide.points = points;
        
        // Save updates to DB
        updateSlideInDB(slide).catch(e => console.error("Error saving to DB", e));
        
        // Refresh grid markers
        updateStatsMarkers();

        // Refresh Text
        dom.displayQuota1.innerText = quota1;
        dom.displayQuota3.innerText = quota3;
        // dom.displayCurrent.innerText = current; // Removed to let animation handle it

        // Play Slot Sound (Looping)
        slotSound.currentTime = 0;
        slotSound.play().catch(e => console.log("Audio play error", e));

        // Animation logic
        animateValue(dom.displayCurrent, 0, current, 2000, () => {
            // Animation Complete
            slotSound.pause();

            // Win Sound if any quota reached
            if ((current >= quota1 && quota1 > 0) || (current >= quota3 && quota3 > 0)) {
                 winSound.currentTime = 0;
                 winSound.play().catch(e => console.log("Audio play error", e));
            }

            // Check if points changed for this slide
            if (points > previousPoints) {
                 // Trigger existing celebration
                 triggerCelebration(points, previousPoints);
            } else {
                // Just update total score if no celebration needed
                 updateTotalScore();
            }
        });
    }

    function updateTotalScore(newPointsForSlide) {
        // Calculate total from all slides
        totalScore = slidesData.reduce((acc, slide) => acc + (slide.points || 0), 0);
        if(dom.mainScoreDisplay) dom.mainScoreDisplay.innerText = totalScore;
    }

    function triggerCelebration(points, previousPoints) {
        // Update Score using the diff so we show the new total correctly or just recalc
        updateTotalScore();

        // Points already added via updateTotalScore called before); // Disco background
        dom.container.classList.add('shake-active'); // Shake container
        
        // Show Big Banner
        const banner = document.getElementById('celebration-banner');
        
        if (points === 3) {
            banner.innerText = "¡LOGRAMOS LA CUOTA!\n+3 PUNTOS";
            banner.style.color = "var(--gold)";
            // Ensure DB is synced after points assignment
            updateSlideInDB(slidesData[currentSlideIndex]);
        } else {
            banner.innerText = "¡LOGRAMOS LA CUOTA!\n+1 PUNTO";
            banner.style.color = "#fff";
            // Ensure DB is synced after points assignment
            updateSlideInDB(slidesData[currentSlideIndex]);
        }
        
        banner.classList.remove('hidden');
        banner.classList.add('visible');

        // Points already updated via updateTotalScore
        
        // Confetti - INTENSE
        const duration = 7000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 45, spread: 360, ticks: 100, zIndex: 0 };
        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        // Big initial burst
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        
        const interval = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                // Cleanup
                document.body.classList.remove('party-mode');
                dom.container.classList.remove('shake-active');
                banner.classList.remove('visible');
                banner.classList.add('hidden');
                
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            // Random bursts from different angles
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
            // Center fountain
            confetti({ particleCount: 5, angle: 90, spread: 45, origin: { x: 0.5, y: 0.8 }, colors: ['#fbbf24', '#ff0000'] });
        }, 200);

        // Sound
        playFanfare();
        
        // Logo Rain
        rainLogos();
    }

    function rainLogos() {
        // Logo file should be at this path
        const logoSrc = 'assets/images/file.png';
        const count = 60; // Increased count for fountain effect
        const container = document.body;

        for (let i = 0; i < count; i++) {
            const img = document.createElement('img');
            img.src = logoSrc;
            img.className = 'fountain-logo';
            
            // Random properties for the fountain
            // Spread: -80vw to +80vw (wide spread)
            const randomX = (Math.random() * 160 - 80); 
            // Rotation: random spin
            const randomRot = (Math.random() * 720 - 360);
            
            const duration = Math.random() * 3 + 2; // 2-5s float time
            const delay = Math.random() * 1.5; // Burst delay
            const size = Math.random() * 60 + 40; // Size variation

            // Set CSS Variables for the specific element
            img.style.setProperty('--x-dest', `${randomX}vw`);
            img.style.setProperty('--rot-dest', `${randomRot}deg`);

            img.style.animationDuration = `${duration}s`;
            img.style.animationDelay = `${delay}s`;
            img.style.width = `${size}px`;
            
            container.appendChild(img);

            // Cleanup after animation
            setTimeout(() => {
                if (img.parentElement) img.remove();
            }, (duration + delay + 1) * 1000);
        }
    }

    function playFanfare() {
        dom.audioPlayer.currentTime = 0;
        dom.audioPlayer.play().catch(e => console.log("Audio requires interaction first or file missing", e));
        
        // Stop after 7 seconds
        setTimeout(() => {
            dom.audioPlayer.pause();
            dom.audioPlayer.currentTime = 0;
        }, 7000);
    }

    function assignPoints(points) {
        totalScore += points;
        if(dom.mainScoreDisplay) dom.mainScoreDisplay.innerText = totalScore;
        closeModal();
    }

    function closeModal() {
        dom.pointsModal.classList.remove('visible');
    }

    function animateValue(obj, start, end, duration, callback) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                if(callback) callback();
            }
        };
        window.requestAnimationFrame(step);
    }
    
    // Config Button Logic
    dom.btnRestart.addEventListener('click', () => {
        if(confirm("¿Volver a la configuración? Si ya guardaste datos, puedes cargar las imágenes de nuevo para continuar.")) {
             showSetup();
        }
    });

    function setupEventListeners() {
        // Setup Screen Events
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.btnStartCustom.addEventListener('click', startCustomPresentation);
        
        // Presentation Events
        dom.btnNext.addEventListener('click', nextSlide);
        dom.btnPrev.addEventListener('click', prevSlide);
        
        // dom.btnValidate.addEventListener('click', validateResult); // Button removed
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Prevent navigating if we are in setup mode (check if setup screen is hidden)
            if (!dom.setupScreen.classList.contains('hidden')) return;

            if(e.key === 'ArrowRight') nextSlide();
            if(e.key === 'ArrowLeft') prevSlide();
        });
        
        // Add "Clear Data" Button if not exists
        if(!document.getElementById('btn-clear-data')) {
            const btnClear = document.createElement('button');
            btnClear.id = 'btn-clear-data';
            btnClear.innerText = '🗑️ Borrar Datos Guardados';
            btnClear.className = 'btn btn-outline';
            btnClear.style.marginTop = '1rem';
            btnClear.onclick = clearProgress;
            dom.fileInput.parentElement.appendChild(btnClear);
        }
    }
});