// Global variables
let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let countdownElement = document.getElementById('countdown');
let setLockBtn = document.getElementById('set-lock-btn');
let unlockBtn = document.getElementById('unlock-btn');
let confirmBtn = document.getElementById('confirm-btn');
let denyBtn = document.getElementById('deny-btn');
let confirmationBtns = document.getElementById('confirmation-btns');
let lockedMessage = document.getElementById('locked-message');

// let lockObjectImage = null; // Not needed, use canvas directly
let lockObjectKeypoints = null;
let lockObjectDescriptors = null;
let isLocked = false;
let stream = null;

// Initialize the camera
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        console.error("Error accessing camera: ", err);
        alert("Could not access the camera. Please ensure you've granted camera permissions.");
    }
}

// Countdown function
async function countdown(action) {
    // Keep video visible during countdown
    countdownElement.style.display = 'block';
    for (let i = 3; i > 0; i--) {
        countdownElement.textContent = i;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    countdownElement.textContent = "Capturing...";
    await new Promise(resolve => setTimeout(resolve, 500));
    countdownElement.style.display = 'none';
    // Capture mirrored image to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (action === 'set') {
        showConfirmation();
    } else if (action === 'unlock') {
        compareImages(video);
    }
}

// Show confirmation UI
function showConfirmation() {
    video.style.display = 'none';
    canvas.style.display = 'block';
    confirmationBtns.style.display = 'block';
    setLockBtn.style.display = 'none';
    unlockBtn.style.display = 'none';

    // Draw the flipped image on the canvas for confirmation (already drawn in countdown)
    // Extract ORB features for the lock object from the canvas
    if (typeof cv !== 'undefined' && cv.ORB) {
        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        let orb = new cv.ORB();
        let keypoints = new cv.KeyPointVector();
        let descriptors = new cv.Mat();
        orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors);
        console.log('[LockObject] keypoints:', keypoints.size(), 'descriptors empty:', descriptors.empty());
        lockObjectKeypoints = keypoints;
        lockObjectDescriptors = descriptors;
        src.delete();
        gray.delete();
        orb.delete();
    }
}

// Compare images using ORB feature matching
function compareImages() {
    // Wait for OpenCV to be ready
    if (typeof cv === 'undefined' || !lockObjectDescriptors || lockObjectDescriptors.empty()) {
        setTimeout(() => compareImages(), 50);
        return;
    }

    // Draw current video frame to canvas (already done in countdown)
    let dst = cv.imread(canvas);
    let dstGray = new cv.Mat();
    cv.cvtColor(dst, dstGray, cv.COLOR_RGBA2GRAY);
    let orb = new cv.ORB();
    let keypoints2 = new cv.KeyPointVector();
    let descriptors2 = new cv.Mat();
    orb.detectAndCompute(dstGray, new cv.Mat(), keypoints2, descriptors2);
    console.log('[Current] keypoints:', keypoints2.size(), 'descriptors empty:', descriptors2.empty());

    let matches = new cv.DMatchVector();
    let matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    if (!lockObjectDescriptors.empty() && !descriptors2.empty()) {
        matcher.match(lockObjectDescriptors, descriptors2, matches);
    }
    let goodMatches = matches.size();

    // Clean up
    dst.delete();
    dstGray.delete();
    orb.delete();
    keypoints2.delete();
    descriptors2.delete();
    matches.delete();
    matcher.delete();

    console.log("ORB match count: ", goodMatches);

    // Threshold: 30% of the number of descriptors found in the current image
    let minDescriptors = Math.min(lockObjectDescriptors.rows, descriptors2.rows);
    let threshold = Math.floor(minDescriptors * 0.3);
    console.log('Threshold for unlock:', threshold);
    if (goodMatches >= threshold && threshold > 0) {
        failedUnlockAttempts = 0;
        unlockScreen(); // Only successful unlock exits fullscreen
    } else {
        failedUnlockAttempts++;
        const mainHeading = document.getElementById('main-heading');
        if (failedUnlockAttempts >= 2) {
            failedUnlockAttempts = 0;
            if (mainHeading) {
                mainHeading.textContent = 'Position your item in the capture area to start scanning.';
            }
        } else {
            if (mainHeading) {
                mainHeading.textContent = 'Object does not match! Try again.';
            }
        }
        // Do NOT call unlockScreen here, so fullscreen is not exited on failure
        canvas.style.display = 'none';
    }
}

// computeSSIM removed: now using ORB feature matching

// Lock the screen
function lockScreen() {
    // Reset heading when locking
    const mainHeading = document.getElementById('main-heading');
    if (mainHeading) {
        mainHeading.textContent = 'Position your item in the capture area to start scanning.';
    }
    // Hide error message when locking
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
    }
    // Make the camera section full screen when locked
    const section = document.querySelector('section');
    if (section.requestFullscreen) {
        section.requestFullscreen();
    } else if (section.webkitRequestFullscreen) { // Safari
        section.webkitRequestFullscreen();
    } else if (section.msRequestFullscreen) { // IE11
        section.msRequestFullscreen();
    }
    console.log('Screen is now locked');
    isLocked = true;
    setLockBtn.style.display = 'none';
    unlockBtn.disabled = false;
    unlockBtn.classList.add('mx-auto', 'block');
    confirmationBtns.style.display = 'none';
    canvas.style.display = 'none';
    video.style.display = 'block';
    lockedMessage.style.display = 'block';
}

// Unlock the screen
function unlockScreen() {
    // Exit full screen when unlocked
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (document.webkitFullscreenElement) { // Safari
        document.webkitExitFullscreen();
    } else if (document.msFullscreenElement) { // IE11
        document.msExitFullscreen();
    }
    console.log('Screen is now unlocked');
    isLocked = false;
    setLockBtn.style.display = '';
    unlockBtn.disabled = true;
    unlockBtn.classList.remove('mx-auto', 'block');
    lockedMessage.style.display = 'none';
    // Show unlock success in heading instead of alert
    const mainHeading = document.getElementById('main-heading');
    if (mainHeading) {
        mainHeading.textContent = 'Screen unlocked successfully!';
    }
}

// Event listeners
setLockBtn.addEventListener('click', () => countdown('set'));
unlockBtn.addEventListener('click', () => countdown('unlock'));
confirmBtn.addEventListener('click', () => {
    lockScreen();
    canvas.style.display = 'none';
    // setLockBtn.style.display = ''; // Remove this line to prevent showing the button after locking
    unlockBtn.style.display = '';
});
denyBtn.addEventListener('click', () => {
    canvas.style.display = 'none';
    confirmationBtns.style.display = 'none';
    video.style.display = 'block';
    setLockBtn.style.display = '';
    unlockBtn.style.display = '';
});

// Initialize
initCamera();