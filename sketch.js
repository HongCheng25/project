const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const OPEN_THRESHOLD = 0.12;
const CLOSED_THRESHOLD = 0.065;
const ARMING_MS = 750;
const STABLE_MS = 850;
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
  textFont("Microsoft JhengHei");
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
  drawFaceMesh();

  const detection = getMouthDetection();

  if (gameState === "landing") {
    drawLandingPage(detection);
    return;
  }

  updateGame(detection.gesture);
  drawDimLayer(28);
  drawGameTopBar(detection);
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

  stroke(119, 255, 214, 82);
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
    fill(isMouthPoint ? color(255, 214, 102) : color(166, 255, 235, 155));
    circle(point.x, point.y, isMouthPoint ? 8 : 3.2);
  }
}

function drawDimLayer(alpha = 96) {
  noStroke();
  fill(7, 16, 14, alpha);
  rect(0, 0, width, height);
}

function drawLandingPage(detection) {
  drawLandingShade();

  const left = max(28, width * 0.07);
  const top = max(64, height * 0.16);
  const titleSize = constrain(width * 0.078, 48, 96);
  const buttonW = min(290, width - left * 2);
  const buttonH = 72;
  const buttonY = min(height - 132, top + titleSize * 2.32);

  startButton = {
    x: left,
    y: buttonY,
    w: buttonW,
    h: buttonH
  };

  drawLandingAccent(left, top);

  fill(255, 214, 102);
  textAlign(LEFT, CENTER);
  textSize(constrain(width * 0.02, 18, 26));
  text("FaceMesh 口型答題挑戰", left, top - 32);

  fill(247, 251, 244);
  textSize(titleSize);
  textLeading(titleSize * 1.04);
  drawShadowText("台灣常識\n快問快答", left, top + titleSize * 0.72);

  fill(219, 232, 227);
  textSize(constrain(width * 0.026, 22, 34));
  text("10 題是非題，開口作答", left, top + titleSize * 2.06);

  const hovering = isInsideButton(mouseX, mouseY, startButton);
  cursor(hovering ? HAND : ARROW);
  drawStartButton(startButton, hovering);

  drawLandingStatus(left, startButton.y + startButton.h + 36, detection);
}

function drawLandingShade() {
  noStroke();
  fill(7, 16, 14, 112);
  rect(0, 0, width, height);

  for (let i = 0; i < 8; i += 1) {
    fill(7, 16, 14, 22 - i * 2);
    rect(i * width * 0.055, 0, width * 0.11, height);
  }
}

function drawLandingAccent(left, top) {
  stroke(255, 214, 102, 220);
  strokeWeight(4);
  line(left, top - 74, left + 96, top - 74);

  stroke(116, 236, 199, 150);
  strokeWeight(2);
  line(left, top - 62, left + 184, top - 62);
}

function drawShadowText(value, x, y) {
  fill(3, 8, 7, 120);
  text(value, x + 4, y + 5);
  fill(247, 251, 244);
  text(value, x, y);
}

function drawStartButton(button, hovering) {
  noStroke();
  fill(hovering ? color(255, 232, 143) : color(255, 214, 102));
  rect(button.x, button.y, button.w, button.h, 8);

  fill(8, 18, 16);
  textAlign(CENTER, CENTER);
  textSize(23);
  text("開始遊戲", button.x + button.w / 2, button.y + button.h / 2);
}

function drawLandingStatus(x, y, detection) {
  const status = detection.hasFace ? "FaceMesh 已就緒" : "請允許鏡頭並面向畫面";

  fill(8, 18, 16, 176);
  noStroke();
  rect(x, y - 24, min(420, width - x * 2), 50, 8);

  fill(detection.hasFace ? color(116, 236, 199) : color(255, 214, 102));
  circle(x + 24, y, 11);

  fill(235, 244, 240);
  textAlign(LEFT, CENTER);
  textSize(20);
  text(status, x + 44, y);
}

function drawGameTopBar(detection) {
  if (gameState === "done") {
    return;
  }

  cursor(ARROW);

  const compact = width < 760;
  const pad = max(14, min(width, height) * 0.024);
  const x = pad;
  const y = pad;
  const panelW = width - pad * 2;
  const panelH = compact ? constrain(height * 0.29, 236, 270) : constrain(height * 0.19, 168, 198);
  const current = questions[questionIndex];

  noStroke();
  fill(8, 18, 16, 205);
  rect(x, y, panelW, panelH, 8);

  stroke(255, 214, 102, 210);
  strokeWeight(3);
  line(x + 18, y + panelH - 2, x + min(panelW - 18, 180), y + panelH - 2);

  drawTopMeta(x, y, panelW);
  drawPromptAndQuestion(x, y, panelW, panelH, compact, current.text);

  if (gameState === "wrongPause") {
    drawWrongNotice(x, y, panelW, panelH);
    return;
  }

  drawGestureStatus(detection, x, y, panelW, panelH, compact);
}

function drawTopMeta(x, y, panelW) {
  fill(202, 220, 215);
  textSize(18);
  textAlign(LEFT, CENTER);
  text(`第 ${questionIndex + 1} / ${questions.length} 題`, x + 22, y + 28);

  textAlign(RIGHT, CENTER);
  text(`答對 ${correctCount}  重答 ${wrongCount}`, x + panelW - 22, y + 28);
}

function drawPromptAndQuestion(x, y, panelW, panelH, compact, questionText) {
  const promptSize = compact ? 31 : 36;
  const questionSize = compact ? 29 : 36;
  const questionX = compact ? x + 22 : x + 168;
  const questionY = compact ? y + 92 : y + 82;
  const questionW = compact ? panelW - 44 : panelW - 540;
  const questionH = compact ? 46 : 66;

  fill(255, 214, 102);
  textAlign(LEFT, CENTER);
  textSize(promptSize);
  text("請作答", x + 22, compact ? y + 66 : y + 82);

  fill(247, 251, 244);
  textSize(fitTextSize(questionText, questionW, questionSize, 23));
  text(questionText, questionX, questionY, questionW, questionH);
}

function drawWrongNotice(x, y, panelW, panelH) {
  fill(255, 118, 96);
  textAlign(LEFT, CENTER);
  textSize(26);
  text("答錯了，再答一次", x + 22, y + panelH - 42, panelW - 44, 44);
}

function drawGestureStatus(detection, x, y, panelW, panelH, compact) {
  const yesActive = detection.gesture === "YES";
  const noActive = detection.gesture === "NO";
  const progress = getHoldProgress();
  const choiceY = compact ? y + 172 : y + 92;
  const noX = compact ? x + 230 : x + panelW - 92;
  const yesX = compact ? x + 92 : noX - 150;

  drawChoicePill(yesX, choiceY, "YES", "張嘴", yesActive);
  drawChoicePill(noX, choiceY, "NO", "閉嘴", noActive);

  const statusText = getGestureStatusText(detection, progress);
  const statusX = compact ? x + 22 : x + panelW - 332;
  const statusY = y + panelH - 42;
  const barX = compact ? x + 22 : x + panelW - 332;
  const barW = compact ? panelW - 44 : 310;
  const barY = statusY + 22;

  fill(220, 235, 230);
  textAlign(LEFT, CENTER);
  textSize(18);
  text(statusText, statusX, statusY);

  noStroke();
  fill(44, 68, 62, 240);
  rect(barX, barY, barW, 8, 4);
  fill(detection.gesture === "YES" ? color(255, 214, 102) : color(116, 236, 199));
  rect(barX, barY, barW * progress, 8, 4);
}

function getGestureStatusText(detection, progress) {
  if (!detection.hasFace) {
    return "找不到臉，請靠近鏡頭";
  }

  const label = detection.gesture ? `偵測：${detection.gesture}` : "偵測：準備中";
  return `${label}  ${floor(progress * 100)}%`;
}

function drawChoicePill(cx, cy, mainLabel, subLabel, active) {
  const w = 122;
  const h = 58;

  noStroke();
  fill(active ? color(255, 214, 102, 240) : color(18, 34, 31, 226));
  rect(cx - w / 2, cy - h / 2, w, h, 8);

  fill(active ? color(8, 18, 16) : color(247, 251, 244));
  textAlign(CENTER, CENTER);
  textSize(24);
  text(mainLabel, cx, cy - 8);
  textSize(15);
  text(subLabel, cx, cy + 15);
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
  textSize(60 + 12 * pulse);
  text("答對了！", width / 2, height * 0.58);
}

function spawnCorrectParticles() {
  particles = [];

  for (let i = 0; i < 110; i += 1) {
    const angle = random(TWO_PI);
    const speed = random(2.5, 8.5);
    particles.push({
      x: width / 2,
      y: height / 2,
      vx: cos(angle) * speed,
      vy: sin(angle) * speed,
      size: random(5, 12),
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
  drawDimLayer(128);

  const panelW = min(width * 0.82, 760);
  const panelH = min(height * 0.42, 330);
  const x = (width - panelW) / 2;
  const y = (height - panelH) / 2;

  noStroke();
  fill(8, 18, 16, 224);
  rect(x, y, panelW, panelH, 8);

  fill(255, 214, 102);
  textAlign(CENTER, CENTER);
  textSize(fitTextSize("完成！", panelW * 0.7, 62, 36));
  text("完成！", width / 2, y + 76);

  fill(247, 251, 244);
  textSize(32);
  text(`10 題全答對，重答 ${wrongCount} 次`, width / 2, y + 152);

  fill(201, 221, 216);
  textSize(22);
  text("按 R 重新開始", width / 2, y + 228);
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
