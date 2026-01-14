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
        displayQuota: document.getElementById('display-quota'),
        displayCurrent: document.getElementById('display-current'),
        inputQuota: document.getElementById('input-quota'),
        inputCurrent: document.getElementById('input-current'),
        btnValidate: document.getElementById('btn-validate'),
        btnPrev: document.getElementById('btn-prev'),
        btnNext: document.getElementById('btn-next'),
        indicator: document.getElementById('slide-indicator'),
        scoreDisplay: document.getElementById('total-score'),
        pointsModal: document.getElementById('points-modal'),
        pointBtns: document.querySelectorAll('.point-btn'),
        btnSkipPoints: document.getElementById('btn-skip-points'),
        audioPlayer: document.getElementById('audio-fanfare'),
        // Setup Screen Elements
        setupScreen: document.getElementById('setup-screen'),
        fileInput: document.getElementById('file-upload'),
        fileList: document.getElementById('file-list'),
        configTitle: document.getElementById('config-title'),
        btnStartCustom: document.getElementById('btn-start-custom'),
        btnLoadDefault: document.getElementById('btn-load-default'),
        btnRestart: document.getElementById('btn-restart')
    };

    // Initialize - Now waits for user
    initSetup();

    // --- PERSISTENCE (IndexedDB) ---
    const DB_NAME = 'PresentationDB';
    const DB_VERSION = 1;
    let db;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject("Error opening DB");
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('slides')) {
                    db.createObjectStore('slides', { keyPath: 'id' });
                }
            };
        });
    }

    async function saveAllSlidesToDB(slides) {
        if (!db) await openDB();
        const tx = db.transaction('slides', 'readwrite');
        const store = tx.objectStore('slides');
        
        // Clear previous data as we are starting fresh
        store.clear();

        slides.forEach(slide => {
            // Clone to avoid modifying the runtime object
            const slideToStore = { ...slide };
            // Remove the runtime ObjectURL (string), keep the blob/file
            delete slideToStore.image; 
            store.put(slideToStore);
        });
    }

    async function updateSlideInDB(slide) {
        if(!db) await openDB();
        const tx = db.transaction('slides', 'readwrite');
        const store = tx.objectStore('slides');
        const slideToStore = { ...slide };
        delete slideToStore.image;
        store.put(slideToStore);
    }

    async function checkSavedSession() {
        if (!db) await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction('slides', 'readonly');
            const store = tx.objectStore('slides');
            const request = store.getAll();
            request.onsuccess = () => {
                const savedSlides = request.result;
                if (savedSlides && savedSlides.length > 0) {
                    // Restore slides
                    slidesData = savedSlides.map(s => ({
                        ...s,
                        image: URL.createObjectURL(s.blob)
                    }));
                    
                    // Restore basics and start
                    appConfig = { soundEffect: "assets/sounds/fanfare.mp3" };
                    dom.audioPlayer.src = appConfig.soundEffect;
                    dom.setupScreen.classList.add('hidden');
                    loadSlide(0);
                    resolve(true);
                } else {
                    resolve(false);
                }
            };
            request.onerror = () => resolve(false);
        });
    }

    function initSetup() {
        setupEventListeners();
        // Check for previous session
        checkSavedSession();
    }

    // --- SETUP LOGIC ---
    function handleFileSelect(e) {
        if (e.target.files && e.target.files.length > 0) {
            tempFiles = Array.from(e.target.files);
            dom.fileList.innerText = `${tempFiles.length} archivos seleccionados:\n` + tempFiles.map(f => f.name).join(', ');
            dom.btnStartCustom.disabled = false;
        } else {
            dom.fileList.innerText = "Ningún archivo seleccionado";
            dom.btnStartCustom.disabled = true;
        }
    }

    function startCustomPresentation() {
        if (tempFiles.length === 0) return;

        const customTitle = dom.configTitle.value.trim();
        
        // Transform files to slides
        slidesData = tempFiles.map((file, index) => {
            return {
                id: index + 1,
                title: customTitle ? `${customTitle} - ${index + 1}` : '', // Use filename as title if no custom title
                image: URL.createObjectURL(file), // Create blob URL
                blob: file, // Store the file object for persistence
                defaultQuota: 0,
                defaultCurrent: 0
            };
        });

        // Save to DB
        saveAllSlidesToDB(slidesData);

        // Use default config for app settings if needed
        appConfig = { soundEffect: "assets/sounds/fanfare.mp3" };
        dom.audioPlayer.src = appConfig.soundEffect;

        // Hide setup, show pres
        dom.setupScreen.classList.add('hidden');
        loadSlide(0);
    }

    async function startDefaultPresentation() {
        try {
            const response = await fetch('content.json');
            const data = await response.json();
            
            appConfig = data.config;
            slidesData = data.slides;
            
            if (appConfig.soundEffect) {
                dom.audioPlayer.src = appConfig.soundEffect;
            }

            dom.setupScreen.classList.add('hidden');
            loadSlide(0);
        } catch (error) {
            console.error("Error loading content.json:", error);
            alert("Error cargando content.json. Verifica que el archivo exista.");
        }
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
        dom.displayQuota.innerText = slide.defaultQuota || 0;
        dom.displayCurrent.innerText = slide.defaultCurrent || 0;
        
        // Populate inputs with defaults
        dom.inputQuota.value = slide.defaultQuota || 0;
        dom.inputCurrent.value = slide.defaultCurrent || 0;
        
        // Update Indicator
        dom.indicator.innerText = `${index + 1} / ${slidesData.length}`;

        // Reset Styles
        dom.displayCurrent.classList.remove('success');
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

    function validateResult() {
        // Sync inputs to display
        const quota = parseFloat(dom.inputQuota.value) || 0;
        const current = parseFloat(dom.inputCurrent.value) || 0;

        // Update Data Model
        if (slidesData[currentSlideIndex]) {
            slidesData[currentSlideIndex].defaultQuota = quota;
            slidesData[currentSlideIndex].defaultCurrent = current;
            // Save updates to DB
            updateSlideInDB(slidesData[currentSlideIndex]).catch(e => console.error("Error saving to DB", e));
        }

        dom.displayQuota.innerText = quota;
        dom.displayCurrent.innerText = current;

        // Animation logic
        animateValue(dom.displayCurrent, 0, current, 1000);

        if (current >= quota) {
            setTimeout(() => {
                triggerCelebration();
            }, 1000); // Wait for number count up
        }
    }

    function triggerCelebration() {
        // Visuals
        dom.displayCurrent.classList.add('success');
        document.body.classList.add('party-mode'); // Disco background
        dom.container.classList.add('shake-active'); // Shake container
        
        // Show Big Banner
        const banner = document.getElementById('celebration-banner');
        banner.classList.remove('hidden');
        banner.classList.add('visible');

        
        // Confetti - INTENSE
        const duration = 5000;
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

        // Show Points Modal with delay
        setTimeout(() => {
            dom.pointsModal.classList.add('visible');
        }, 3000); // Wait longer to enjoy the celebration
    }

    function playFanfare() {
        dom.audioPlayer.currentTime = 0;
        dom.audioPlayer.play().catch(e => console.log("Audio requires interaction first or file missing", e));
    }

    function assignPoints(points) {
        totalScore += points;
        dom.scoreDisplay.innerText = totalScore;
        closeModal();
    }

    function closeModal() {
        dom.pointsModal.classList.remove('visible');
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {() => {
             // Clear DB on restart
             if(confirm("¿Seguro? Se borrarán los datos guardados.")) {
                if(db) {
                     const tx = db.transaction('slides', 'readwrite');
                     tx.objectStore('slides').clear();
                }
                showSetup();
             }
        }
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function setupEventListeners() {
        // Setup Screen Events
        dom.fileInput.addEventListener('change', handleFileSelect);
        dom.btnStartCustom.addEventListener('click', startCustomPresentation);
        dom.btnLoadDefault.addEventListener('click', startDefaultPresentation);
        dom.btnRestart.addEventListener('click', showSetup);

        // Presentation Events
        dom.btnNext.addEventListener('click', nextSlide);
        dom.btnPrev.addEventListener('click', prevSlide);
        
        dom.btnValidate.addEventListener('click', validateResult);
        
        dom.pointBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const points = parseInt(e.target.dataset.points);
                assignPoints(points);
            });
        });

        dom.btnSkipPoints.addEventListener('click', closeModal);

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Prevent navigating if we are in setup mode (check if setup screen is hidden)
            if (!dom.setupScreen.classList.contains('hidden')) return;

            if(e.key === 'ArrowRight') nextSlide();
            if(e.key === 'ArrowLeft') prevSlide();
        });
    }
});