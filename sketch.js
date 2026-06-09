const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const OPEN_THRESHOLD = 0.12;
const CLOSED_THRESHOLD = 0.065;
const ARMING_MS = 750;
const STABLE_MS = 900;
const CORRECT_EFFECT_MS = 3000;
const WRONG_PAUSE_MS = 1200;

let faceMesh;
let video;
let faces = [];
let triangles = [];
let particles = [];
let startButton = null;

let questionIndex = 0;
let correctCount = 0;
let wrongCount = 0;
let gameState = "landing";
let questionStartedAt = 0;
let candidateGesture = null;
let candidateSince = 0;
let effectStartedAt = 0;
let feedbackUntil = 0;
let smoothedMouthRatio = null;

const questions = [
  { text: "台灣本島的東側面向太平洋。", answer: true },
  { text: "玉山是台灣最高的山峰。", answer: true },
  { text: "日月潭位於南投縣。", answer: true },
  { text: "台灣的法定貨幣是新台幣。", answer: true },
  { text: "澎湖群島位於台灣海峽。", answer: true },
  { text: "中央山脈是台灣主要山脈之一。", answer: true },
  { text: "台灣所有縣市都叫做省。", answer: false },
  { text: "墾丁國家公園位於台灣北部。", answer: false },
  { text: "阿里山國家森林遊樂區位於嘉義縣。", answer: true },
  { text: "蘭嶼位於台灣本島西側海域。", answer: false }
];

function preload() {
  const options = { maxFaces: 1, refineLandmarks: false, flipHorizontal: false };
  faceMesh = ml5.faceMesh(options);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('"Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif');
  textWrap(WORD);

  video = createCapture(VIDEO);
  video.size(VIDEO_WIDTH, VIDEO_HEIGHT);
  video.hide();

  triangles = faceMesh.getTriangles();
  faceMesh.detectStart(video, gotFaces);
  hideLoading();
}

function draw() {
  background(7, 16, 14);
  drawCameraBackground();

  const detection = getMouthDetection();
  drawFaceMesh();

  if (gameState === "landing") {
    drawLandingPage(detection);
    return;
  }

  updateGame(detection.gesture);
  drawDimLayer(86);
  drawHud(detection);
  updateParticles();

  if (gameState === "correct") {
    drawCorrectEffect();
  }

  if (gameState === "done") {
    drawDoneScreen();
  }
}

function gotFaces(results) {
  faces = results;
}

function startGame() {
  questionIndex = 0;
  correctCount = 0;
  wrongCount = 0;
  particles = [];
  smoothedMouthRatio = null;
  beginAnswerWindow();
}

function updateGame(gesture) {
  if (gameState === "correct") {
    if (millis() - effectStartedAt >= CORRECT_EFFECT_MS) {
      goToNextQuestion();
    }
    return;
  }

  if (gameState === "wrongPause") {
    if (millis() >= feedbackUntil) {
      beginAnswerWindow();
    }
    return;
  }

  if (gameState !== "answering") {
    return;
  }

  if (millis() - questionStartedAt < ARMING_MS) {
    candidateGesture = null;
    return;
  }

  if (!gesture) {
    candidateGesture = null;
    return;
  }

  if (candidateGesture !== gesture) {
    candidateGesture = gesture;
    candidateSince = millis();
    return;
  }

  if (millis() - candidateSince >= STABLE_MS) {
    submitAnswer(gesture);
  }
}

function submitAnswer(gesture) {
  const answerIsYes = gesture === "YES";
  const current = questions[questionIndex];

  candidateGesture = null;
  candidateSince = 0;

  if (answerIsYes === current.answer) {
    correctCount += 1;
    gameState = "correct";
    effectStartedAt = millis();
    spawnCorrectParticles();
  } else {
    wrongCount += 1;
    gameState = "wrongPause";
    feedbackUntil = millis() + WRONG_PAUSE_MS;
  }
}

function beginAnswerWindow() {
  gameState = "answering";
  questionStartedAt = millis();
  candidateGesture = null;
  candidateSince = 0;
}

function goToNextQuestion() {
  questionIndex += 1;
  particles = [];

  if (questionIndex >= questions.length) {
    gameState = "done";
    candidateGesture = null;
    return;
  }

  beginAnswerWindow();
}

function resetGame() {
  startGame();
}

function getMouthDetection() {
  const face = faces[0];

  if (!face || !face.keypoints || face.keypoints.length < 292) {
    return { gesture: null, ratio: smoothedMouthRatio, hasFace: false };
  }

  const upperLip = face.keypoints[13];
  const lowerLip = face.keypoints[14];
  const leftMouth = face.keypoints[61];
  const rightMouth = face.keypoints[291];

  if (!upperLip || !lowerLip || !leftMouth || !rightMouth) {
    return { gesture: null, ratio: smoothedMouthRatio, hasFace: false };
  }

  const mouthHeight = pointDistance(upperLip, lowerLip);
  const mouthWidth = max(pointDistance(leftMouth, rightMouth), 1);
  const ratio = mouthHeight / mouthWidth;

  smoothedMouthRatio = smoothedMouthRatio === null
    ? ratio
    : lerp(smoothedMouthRatio, ratio, 0.35);

  let gesture = null;
  if (smoothedMouthRatio > OPEN_THRESHOLD) {
    gesture = "YES";
  } else if (smoothedMouthRatio < CLOSED_THRESHOLD) {
    gesture = "NO";
  }

  return { gesture, ratio: smoothedMouthRatio, hasFace: true };
}

function drawCameraBackground() {
  const rect = getVideoRect();
  image(video, rect.x, rect.y, rect.w, rect.h);
}

function drawFaceMesh() {
  const face = faces[0];
  if (!face || !face.keypoints) {
    return;
  }

  stroke(119, 255, 214, 72);
  strokeWeight(1);
  noFill();

  for (let i = 0; i < triangles.length; i += 1) {
    const [a, b, c] = triangles[i];
    const pa = mapKeypoint(face.keypoints[a]);
    const pb = mapKeypoint(face.keypoints[b]);
    const pc = mapKeypoint(face.keypoints[c]);

    if (!pa || !pb || !pc) {
      continue;
    }

    line(pa.x, pa.y, pb.x, pb.y);
    line(pb.x, pb.y, pc.x, pc.y);
    line(pc.x, pc.y, pa.x, pa.y);
  }

  noStroke();
  for (let i = 0; i < face.keypoints.length; i += 1) {
    const point = mapKeypoint(face.keypoints[i]);
    if (!point) {
      continue;
    }

    const isMouthPoint = [13, 14, 61, 291].includes(i);
    fill(isMouthPoint ? color(255, 214, 102) : color(166, 255, 235, 150));
    circle(point.x, point.y, isMouthPoint ? 7 : 3);
  }
}

function drawDimLayer(alpha = 96) {
  noStroke();
  fill(7, 16, 14, alpha);
  rect(0, 0, width, height);
}

function drawLandingPage(detection) {
  drawDimLayer(134);

  const left = max(24, width * 0.07);
  const centerY = height * 0.42;
  const titleSize = constrain(width * 0.07, 38, 82);

  startButton = {
    x: left,
    y: centerY + 142,
    w: min(230, width - left * 2),
    h: 58
  };

  fill(255, 214, 102);
  textAlign(LEFT, CENTER);
  textSize(18);
  text("p5.js + ml5.js FaceMesh", left, centerY - 118);

  fill(247, 251, 244);
  textSize(titleSize);
  text("台灣常識\n快問快答", left, centerY - 24);

  fill(201, 221, 216);
  textSize(constrain(width * 0.026, 18, 27));
  text("張嘴 YES，閉嘴 NO", left, centerY + 92);

  const hovering = isInsideButton(mouseX, mouseY, startButton);
  cursor(hovering ? HAND : ARROW);
  fill(hovering ? color(255, 232, 143) : color(255, 214, 102));
  rect(startButton.x, startButton.y, startButton.w, startButton.h, 8);

  fill(8, 18, 16);
  textSize(22);
  textAlign(CENTER, CENTER);
  text("開始遊戲", startButton.x + startButton.w / 2, startButton.y + startButton.h / 2);

  fill(201, 221, 216);
  textSize(16);
  textAlign(LEFT, CENTER);
  const status = detection.hasFace ? "FaceMesh 已就緒" : "請允許鏡頭並面向畫面";
  text(status, left, startButton.y + startButton.h + 34);
}

function drawHud(detection) {
  if (gameState === "done") {
    return;
  }

  cursor(ARROW);
  const pad = min(width, height) * 0.035;
  const topHeight = 68;

  noStroke();
  fill(8, 18, 16, 180);
  rect(0, 0, width, topHeight);

  fill(247, 251, 244);
  textSize(20);
  textAlign(LEFT, CENTER);
  text(`第 ${questionIndex + 1} / ${questions.length} 題`, pad, topHeight / 2);

  textAlign(RIGHT, CENTER);
  text(`答對 ${correctCount}  重答 ${wrongCount}`, width - pad, topHeight / 2);

  drawQuestionPanel(detection);
}

function drawQuestionPanel(detection) {
  const pad = min(width, height) * 0.035;
  const panelW = min(width - pad * 2, 540);
  const panelH = min(height - 110, 350);
  const x = pad;
  const y = 88;
  const current = questions[questionIndex];

  noStroke();
  fill(8, 18, 16, 210);
  rect(x, y, panelW, panelH, 8);

  fill(255, 214, 102);
  textAlign(LEFT, CENTER);
  textSize(fitTextSize("請作答", panelW - 44, 36, 24));
  text("請作答", x + 22, y + 44);

  fill(247, 251, 244);
  textSize(fitTextSize(current.text, panelW - 44, 29, 20));
  text(current.text, x + 22, y + 88, panelW - 44, 98);

  if (gameState === "wrongPause") {
    fill(255, 118, 96);
    textSize(fitTextSize("答錯了，再答一次", panelW - 44, 28, 20));
    text("答錯了，再答一次", x + 22, y + panelH - 96, panelW - 44, 48);
  } else {
    drawGestureStatus(detection, x, y, panelW, panelH);
  }
}

function drawGestureStatus(detection, x, y, panelW, panelH) {
  const yesActive = detection.gesture === "YES";
  const noActive = detection.gesture === "NO";
  const choiceY = y + panelH - 128;
  const leftChoice = x + panelW * 0.28;
  const rightChoice = x + panelW * 0.72;

  drawChoicePill(leftChoice, choiceY, "YES", "張嘴", yesActive);
  drawChoicePill(rightChoice, choiceY, "NO", "閉嘴", noActive);

  const statusY = y + panelH - 50;
  fill(201, 221, 216);
  textAlign(LEFT, CENTER);
  textSize(16);

  if (!detection.hasFace) {
    text("找不到臉，請靠近鏡頭", x + 22, statusY);
    return;
  }

  const label = detection.gesture ? `偵測：${detection.gesture}` : "偵測：準備中";
  const progress = getHoldProgress();
  text(`${label}  ${floor(progress * 100)}%`, x + 22, statusY);

  const barW = panelW - 44;
  const barH = 7;
  const barX = x + 22;
  const barY = statusY + 22;

  noStroke();
  fill(49, 71, 66, 230);
  rect(barX, barY, barW, barH, barH / 2);
  fill(detection.gesture === "YES" ? color(255, 214, 102) : color(116, 236, 199));
  rect(barX, barY, barW * progress, barH, barH / 2);
}

function drawChoicePill(cx, cy, mainLabel, subLabel, active) {
  const w = min(160, width * 0.25);
  const h = 66;

  noStroke();
  fill(active ? color(255, 214, 102, 230) : color(18, 34, 31, 230));
  rect(cx - w / 2, cy - h / 2, w, h, 8);

  fill(active ? color(8, 18, 16) : color(247, 251, 244));
  textAlign(CENTER, CENTER);
  textSize(23);
  text(mainLabel, cx, cy - 10);
  textSize(15);
  text(subLabel, cx, cy + 17);
}

function drawCorrectEffect() {
  const elapsed = millis() - effectStartedAt;
  const t = constrain(elapsed / CORRECT_EFFECT_MS, 0, 1);
  const pulse = sin(t * PI);

  noFill();
  stroke(255, 214, 102, 190 * (1 - t));
  strokeWeight(5);
  circle(width / 2, height / 2, 130 + 240 * t);
  stroke(116, 236, 199, 160 * (1 - t));
  strokeWeight(3);
  circle(width / 2, height / 2, 210 + 320 * t);

  noStroke();
  fill(255, 214, 102);
  textAlign(CENTER, CENTER);
  textSize(46 + 10 * pulse);
  text("答對了！", width / 2, height * 0.58);
}

function spawnCorrectParticles() {
  particles = [];

  for (let i = 0; i < 96; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(2.5, 8.5);
    particles.push({
      x: width / 2,
      y: height / 2,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(4, 10),
      life: random(70, 120),
      hue: random([0, 1, 2])
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.05;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.life -= 1;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = map(p.life, 0, 120, 0, 230);
    noStroke();
    if (p.hue === 0) {
      fill(255, 214, 102, alpha);
    } else if (p.hue === 1) {
      fill(116, 236, 199, alpha);
    } else {
      fill(255, 118, 96, alpha);
    }
    circle(p.x, p.y, p.size);
  }
}

function drawDoneScreen() {
  const panelW = min(width * 0.82, 720);
  const panelH = min(height * 0.38, 290);
  const x = (width - panelW) / 2;
  const y = (height - panelH) / 2;

  noStroke();
  fill(8, 18, 16, 220);
  rect(x, y, panelW, panelH, 8);

  fill(255, 214, 102);
  textAlign(CENTER, CENTER);
  textSize(fitTextSize("完成！", panelW * 0.7, 48, 30));
  text("完成！", width / 2, y + 65);

  fill(247, 251, 244);
  textSize(26);
  text(`10 題全答對，重答 ${wrongCount} 次`, width / 2, y + 132);

  fill(201, 221, 216);
  textSize(18);
  text("按 R 重新開始", width / 2, y + 198);
}

function getHoldProgress() {
  if (gameState !== "answering" || !candidateGesture) {
    return 0;
  }
  return constrain((millis() - candidateSince) / STABLE_MS, 0, 1);
}

function getVideoRect() {
  const videoRatio = VIDEO_WIDTH / VIDEO_HEIGHT;
  const canvasRatio = width / height;

  if (canvasRatio > videoRatio) {
    const w = width;
    const h = width / videoRatio;
    return { x: 0, y: (height - h) / 2, w, h };
  }

  const h = height;
  const w = height * videoRatio;
  return { x: (width - w) / 2, y: 0, w, h };
}

function mapKeypoint(point) {
  if (!point) {
    return null;
  }

  const rect = getVideoRect();
  return {
    x: rect.x + (point.x / VIDEO_WIDTH) * rect.w,
    y: rect.y + (point.y / VIDEO_HEIGHT) * rect.h
  };
}

function pointDistance(a, b) {
  return dist(a.x, a.y, b.x, b.y);
}

function fitTextSize(value, maxWidth, startSize, minSize) {
  let size = startSize;
  textSize(size);

  while (textWidth(value) > maxWidth && size > minSize) {
    size -= 1;
    textSize(size);
  }

  return size;
}

function hideLoading() {
  const loading = document.getElementById("loading");
  if (loading) {
    loading.style.display = "none";
  }
}

function isInsideButton(px, py, button) {
  if (!button) {
    return false;
  }

  return px >= button.x
    && px <= button.x + button.w
    && py >= button.y
    && py <= button.y + button.h;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function mousePressed() {
  if (gameState === "landing" && isInsideButton(mouseX, mouseY, startButton)) {
    startGame();
  }
}

function keyPressed() {
  if (gameState === "landing" && (keyCode === ENTER || key === " ")) {
    startGame();
  }

  if (key === "r" || key === "R") {
    resetGame();
  }
}
