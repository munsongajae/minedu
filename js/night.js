// 밤을 지켜라: 마인크래프트 1인칭 3D 활 쏘기 디펜스 게임.
// 저 멀리 밤 평원에서 좀비·스켈레톤·크리퍼·엔더맨이 한글/영어 간판을 달고 다가온다.
// 아래 4개 단어 보기(PC 숫자키 1~4)로 맞는 단어를 골라 활시위를 당겨 화살을 쏘아 막는다!
import * as THREE from './three.module.min.js';
import { $, esc, shuffle } from './learn.js';
import { sfx } from './sfx.js';

const TOTAL = 12, HEARTS = 3, MAX_ALIVE = 3, LANES = 3;
// 3개 레인: 화면 전체에 넓게 분산 (왼쪽 / 중앙 / 오른쪽)
const LANES_CONFIG = [
  { startX: -7.5, endX: -4.6 }, // 왼쪽 레인
  { startX: 0.0,  endX: 0.0 },  // 중앙 레인
  { startX: 7.5,  endX: 4.6 }   // 오른쪽 레인
];
const Z_SPAWN = -34;
const Z_REACH = -3.8;
const SPEEDS = {
  slow: { walk: 17, gap: 4.6 },
  normal: { walk: 13, gap: 3.6 },
  fast: { walk: 10, gap: 2.8 }
};
const MATERIALS = ['grass', 'sky', 'gold', 'dirt'];

/* ---------- 기존 호환용 SVG 에셋 (다른 게임/홈 화면 카드에서 참조) ---------- */
export const HEART = `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/></svg>`;
export const HOUSE = `<svg class="ng-house-svg" viewBox="0 0 16 15" shape-rendering="crispEdges" aria-hidden="true"><g class="roof"><rect x="7" y="0" width="2" height="1"/><rect x="5" y="1" width="6" height="1"/><rect x="3" y="2" width="10" height="1"/><rect x="1" y="3" width="14" height="1"/><rect x="0" y="4" width="16" height="1"/></g><g class="wall"><rect x="1" y="5" width="14" height="10"/></g><g class="plank"><rect x="1" y="8" width="14" height="1"/><rect x="1" y="11" width="14" height="1"/></g><g class="door"><rect x="9" y="9" width="4" height="6"/></g><g class="win"><rect x="3" y="6" width="4" height="4"/></g><g class="frame"><rect x="4" y="6" width="1" height="4"/><rect x="3" y="7" width="4" height="1"/></g></svg>`;
export const ZOMBIE_SVG = `<svg class="ng-creature zombie" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true"><ellipse class="mc-shadow" cx="13" cy="37.5" rx="8.5" ry="2" fill="rgba(0,0,0,0.38)"/><g class="mc-arm-far"><polygon points="12,14 17,13 18,15 13,16" fill="#1b8587"/><rect x="13" y="15" width="4" height="3" fill="#146d6f"/><polygon points="17,13 22,13 22,15 17,15" fill="#69a838"/><rect x="17" y="15" width="5" height="3" fill="#4d8226"/><rect x="17" y="18" width="5" height="1" fill="#38601c"/></g><g class="mc-leg-far"><rect x="11" y="25" width="2" height="11" fill="#1b1735"/><rect x="13" y="25" width="4" height="11" fill="#2a2350"/><rect x="13" y="30" width="4" height="1" fill="#201a3e"/><rect x="12" y="35" width="5" height="1.5" fill="#16132b"/></g><g class="mc-torso"><polygon points="7,14 11,11.5 18,12.5 14,15" fill="#2ac3c5"/><polygon points="7,14 10,13.5 10,25 7,24" fill="#135f61"/><polygon points="10,13.5 17,14 17,25 10,25" fill="#1ea8aa"/><polygon points="12,13.8 14.5,13.9 13.5,16.5 12,16.5" fill="#588c34"/><rect x="10" y="23.5" width="7" height="1.5" fill="#157c7e"/></g><g class="mc-leg-near"><polygon points="7,24 10,24 12,25 9,25" fill="#4d4282"/><rect x="6.5" y="25" width="2.5" height="11" fill="#231d42"/><rect x="9" y="25" width="4.5" height="11" fill="#3a3168"/><rect x="9" y="25" width="1" height="10" fill="#483d7e"/><rect x="8" y="30" width="5" height="1" fill="#28224a"/><rect x="7" y="35" width="6.5" height="1.5" fill="#1c1735"/></g><g class="mc-arm-near"><polygon points="6,15 10,14 12,16 8,17" fill="#2fc5c7"/><polygon points="6,15 8,17 8,20 6,18" fill="#14686a"/><polygon points="8,17 12,16 12,19 8,20" fill="#1ea8aa"/><polygon points="12,16 23,16 24,18 13,18" fill="#75b840"/><rect x="13" y="18" width="11" height="3" fill="#588c34"/><rect x="13" y="21" width="11" height="1" fill="#3d6324"/><rect x="23" y="17" width="1" height="4" fill="#30501c"/></g><g class="mc-head"><polygon points="8,5 12,2 18,3 14,6" fill="#4a7327"/><polygon points="10,4.5 13,2.5 16,3.2 13,5.2" fill="#5c8c32"/><polygon points="8,5 11,5.5 11,14 8,13" fill="#2d4817"/><rect x="9" y="8" width="1.5" height="2" fill="#243b12"/><polygon points="8,10 11,10.5 11,14 8,13" fill="#3b5e22"/><polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#588c34"/><rect x="11" y="5.5" width="7" height="2.5" fill="#38581e"/><rect x="13" y="8" width="2" height="1" fill="#38581e"/><rect x="12" y="9" width="2" height="1.5" fill="#13210d"/><rect x="12.5" y="9" width="1" height="1" fill="#233550"/><rect x="15" y="9.5" width="2" height="1.5" fill="#13210d"/><rect x="15.5" y="9.5" width="1" height="1" fill="#233550"/><rect x="14" y="11.5" width="2" height="1" fill="#426827"/><rect x="13" y="13" width="3" height="1" fill="#2e4c1a"/></g></svg>`;
export const SKELETON_SVG = `<svg class="ng-creature skeleton" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true"><ellipse class="mc-shadow" cx="13" cy="37.5" rx="8" ry="1.8" fill="rgba(0,0,0,0.38)"/><g class="mc-arm-far"><rect x="14" y="14" width="2" height="8" fill="#999684"/></g><g class="mc-leg-far"><rect x="13" y="25" width="2.5" height="11" fill="#918e7d"/><rect x="13" y="29.5" width="2.5" height="1" fill="#6d6a5c"/><rect x="13" y="35" width="3" height="1.5" fill="#757364"/></g><g class="mc-torso"><rect x="8" y="14" width="8" height="10" fill="#141414"/><rect x="11.5" y="14" width="2" height="10" fill="#e0ddd0"/><polygon points="7,14 11,12 17,13 13,15" fill="#f4f1e4"/><rect x="8" y="15.5" width="8" height="1.2" fill="#dcd9c8"/><rect x="8.5" y="18" width="7.5" height="1.2" fill="#dcd9c8"/><rect x="9" y="20.5" width="6.5" height="1.2" fill="#dcd9c8"/><polygon points="8,23 16,23.5 15,25.5 9,25" fill="#c7c3b2"/></g><g class="mc-leg-near"><rect x="8.5" y="25" width="1" height="11" fill="#999684"/><rect x="9.5" y="25" width="2" height="11" fill="#dedbc9"/><rect x="8.5" y="30" width="3" height="1" fill="#aba794"/><rect x="9" y="35" width="3.5" height="1.5" fill="#b8b4a2"/></g><g class="mc-arm-near"><polygon points="7,14 10,14 16,18 14,20" fill="#dedbc9"/><rect x="13" y="18" width="2" height="2" fill="#b0ac9a"/><g class="mc-bow"><rect x="16" y="9" width="2" height="3" fill="#693c18"/><rect x="17.5" y="11" width="2" height="4" fill="#8f562b"/><rect x="19" y="14" width="2" height="4" fill="#aa6c35"/><rect x="19.5" y="17" width="2.5" height="4" fill="#bd7d42"/><rect x="18.5" y="17.5" width="1.5" height="3" fill="#693c18"/><rect x="19" y="20" width="2" height="4" fill="#aa6c35"/><rect x="17.5" y="23" width="2" height="4" fill="#8f562b"/><rect x="16" y="26" width="2" height="3" fill="#693c18"/><line x1="16.5" y1="9.5" x2="16.5" y2="28.5" stroke="#f0f0f0" stroke-width="0.8"/><line x1="14" y1="18.5" x2="24" y2="18.5" stroke="#8a5e35" stroke-width="1"/><polygon points="24,17.5 26,18.5 24,19.5" fill="#d2d2d2"/><rect x="14" y="17.5" width="1.5" height="2" fill="#f8f8f8"/></g></g><g class="mc-head"><polygon points="8,5 12,2 18,3 14,6" fill="#f4f1e4"/><polygon points="8,5 11,5.5 11,14 8,13" fill="#918e7c"/><rect x="8.5" y="7" width="2" height="3" fill="#757262"/><polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#dedbc9"/><rect x="12" y="8" width="2" height="2" fill="#141414"/><rect x="15" y="8.5" width="2.5" height="2" fill="#141414"/><polygon points="14,11 15,11 14.5,12" fill="#141414"/><rect x="12" y="12.5" width="5.5" height="1.2" fill="#2b2b2b"/><line x1="13.5" y1="12.5" x2="13.5" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/><line x1="15" y1="12.5" x2="15" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/><line x1="16.5" y1="12.5" x2="16.5" y2="13.7" stroke="#dedbc9" stroke-width="0.6"/></g></svg>`;
export const CREEPER_SVG = `<svg class="ng-creature creeper" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true"><ellipse class="mc-shadow" cx="13" cy="37.5" rx="8.5" ry="2" fill="rgba(0,0,0,0.38)"/><g class="mc-leg-rear-far"><rect x="6" y="27" width="3.5" height="8" fill="#32631f"/><rect x="6" y="34" width="3.5" height="1.5" fill="#182c10"/></g><g class="mc-leg-rear-near"><polygon points="9,28 13,28 13,36 9,36" fill="#4d8c32"/><rect x="9" y="34.5" width="4" height="1.5" fill="#182c10"/></g><g class="mc-leg-front-far"><rect x="13" y="27" width="3.5" height="8" fill="#3d7528"/><rect x="13" y="34" width="3.5" height="1.5" fill="#182c10"/></g><g class="mc-leg-front-near"><polygon points="16,28 20,28 20,36 16,36" fill="#589e3a"/><rect x="16" y="34.5" width="4" height="1.5" fill="#182c10"/></g><g class="mc-torso"><polygon points="7,14 11,11.5 18,12.5 14,15" fill="#75c74e"/><polygon points="7,14 10,13.5 10,28 7,27" fill="#2d5c1c"/><rect x="7" y="16" width="3" height="3" fill="#244a16"/><rect x="7" y="21" width="3" height="2" fill="#387023"/><polygon points="10,13.5 18,14.5 18,28 10,28" fill="#529938"/><rect x="11" y="15" width="2" height="2" fill="#73c750"/><rect x="14" y="15" width="3" height="2" fill="#3c7826"/><rect x="12" y="18" width="3" height="3" fill="#65b844"/><rect x="15" y="19" width="3" height="2" fill="#88db5f"/><rect x="10.5" y="22" width="2.5" height="3" fill="#366b23"/><rect x="14" y="23" width="3" height="3" fill="#4d9432"/></g><g class="mc-head"><polygon points="8,5 12,2 18,3 14,6" fill="#75c74e"/><polygon points="10,4.5 13,2.5 16,3.2 13,5.2" fill="#8ae060"/><polygon points="8,5 11,5.5 11,14 8,13" fill="#2d5c1c"/><rect x="8.5" y="8" width="2" height="2" fill="#204214"/><polygon points="11,5.5 18,6.5 18,14.5 11,14" fill="#5db03e"/><rect x="11" y="6" width="3" height="2" fill="#79d453"/><rect x="15" y="6.5" width="3" height="2" fill="#46872d"/><rect x="11.5" y="8" width="2" height="2" fill="#0d180b"/><rect x="15.5" y="8.5" width="2" height="2" fill="#0d180b"/><rect x="13.5" y="9.5" width="2" height="2" fill="#0d180b"/><rect x="12.5" y="11" width="1.5" height="2.5" fill="#0d180b"/><rect x="15" y="11.5" width="1.5" height="2.5" fill="#0d180b"/><rect x="12" y="13" width="5" height="1" fill="#0d180b"/></g></svg>`;
export const ENDERMAN_SVG = `<svg class="ng-creature enderman" viewBox="0 0 26 39" shape-rendering="crispEdges" aria-hidden="true"><ellipse class="mc-shadow" cx="13" cy="37.5" rx="7.5" ry="1.8" fill="rgba(0,0,0,0.38)"/><g class="mc-arm-far"><rect x="14" y="11" width="1.8" height="22" fill="#0f0f12"/></g><g class="mc-leg-far"><rect x="12.5" y="22" width="2" height="15" fill="#0f0f12"/></g><g class="mc-torso"><polygon points="8,10 11,9 16,9.5 13,11" fill="#282830"/><polygon points="8,10 10,9.8 10,22 8,21.5" fill="#121216"/><polygon points="10,9.8 15,10.2 15,22 10,22" fill="#1a1a20"/></g><g class="mc-leg-near"><rect x="8.5" y="22" width="2.2" height="15" fill="#18181e"/><rect x="8.5" y="35.5" width="3" height="1.5" fill="#101014"/></g><g class="mc-arm-near"><rect x="7" y="11" width="2" height="22" fill="#1a1a22"/><rect x="7" y="31" width="2" height="3" fill="#121218"/></g><g class="mc-head"><polygon points="8,3.5 11,1 17,1.8 13,4.5" fill="#2e2e38"/><polygon points="8,3.5 10,4 10,10 8,9.5" fill="#111116"/><polygon points="10,4 17,4.8 17,10.5 10,10" fill="#1a1a22"/><rect x="11" y="6" width="2" height="1.2" fill="#d645f5"/><rect x="11.5" y="6.2" width="1" height="0.8" fill="#ffa8ff"/><rect x="14.5" y="6.4" width="2" height="1.2" fill="#d645f5"/><rect x="15" y="6.6" width="1" height="0.8" fill="#ffa8ff"/></g><g class="mc-ender-sparks"><rect class="mc-spark s1" x="5" y="6" width="1.2" height="1.2" fill="#d645f5"/><rect class="mc-spark s2" x="18" y="14" width="1.2" height="1.2" fill="#d645f5"/><rect class="mc-spark s3" x="4" y="20" width="1.2" height="1.2" fill="#ba33db"/><rect class="mc-spark s4" x="17" y="28" width="1.2" height="1.2" fill="#e86eff"/></g></svg>`;

export const MOB_TYPES = [
  { name: '좀비', kind: 'zombie', svg: ZOMBIE_SVG },
  { name: '스켈레톤', kind: 'skeleton', svg: SKELETON_SVG },
  { name: '크리퍼', kind: 'creeper', svg: CREEPER_SVG },
  { name: '엔더맨', kind: 'enderman', svg: ENDERMAN_SVG },
];

/* ---------- 3D 텍스처 생성기 (16x16 픽셀 마인크래프트 스타일) ---------- */
function createPixelTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

// 몹 얼굴 픽셀 텍스처 (선명하고 밝은 색감)
const TEX_ZOMBIE_FACE = createPixelTexture(8, 8, (c) => {
  c.fillStyle = '#5cb232'; c.fillRect(0, 0, 8, 8);
  c.fillStyle = '#3c7a1e'; c.fillRect(0, 0, 8, 2); c.fillRect(0, 2, 1, 2); c.fillRect(7, 2, 1, 2);
  c.fillStyle = '#14243b'; c.fillRect(1, 3, 2, 1); c.fillRect(5, 3, 2, 1);
  c.fillStyle = '#ffffff'; c.fillRect(1, 4, 1, 1); c.fillRect(5, 4, 1, 1);
  c.fillStyle = '#418224'; c.fillRect(3, 4, 2, 1); c.fillRect(2, 6, 4, 1);
});

const TEX_SKELETON_FACE = createPixelTexture(8, 8, (c) => {
  c.fillStyle = '#e8e4d2'; c.fillRect(0, 0, 8, 8);
  c.fillStyle = '#b8b4a2'; c.fillRect(0, 0, 8, 1); c.fillRect(0, 7, 8, 1);
  c.fillStyle = '#0a0a0a';
  c.fillRect(1, 2, 2, 2); c.fillRect(5, 2, 2, 2); // 눈
  c.fillRect(3, 4, 2, 1); // 코
  c.fillRect(2, 6, 4, 1); // 입
});

const TEX_CREEPER_FACE = createPixelTexture(8, 8, (c) => {
  c.fillStyle = '#6ade3e'; c.fillRect(0, 0, 8, 8);
  c.fillStyle = '#82f250'; c.fillRect(0, 1, 2, 2); c.fillRect(6, 4, 2, 2); c.fillRect(1, 6, 2, 2);
  c.fillStyle = '#4da828'; c.fillRect(2, 0, 2, 2); c.fillRect(5, 1, 2, 2); c.fillRect(0, 4, 2, 2);
  c.fillStyle = '#050a04'; // 크리퍼 고유 얼굴
  c.fillRect(1, 2, 2, 2); c.fillRect(5, 2, 2, 2);
  c.fillRect(3, 3, 2, 2);
  c.fillRect(2, 5, 4, 2); c.fillRect(2, 7, 1, 1); c.fillRect(5, 7, 1, 1);
});

const TEX_ENDERMAN_FACE = createPixelTexture(8, 8, (c) => {
  c.fillStyle = '#1e1e28'; c.fillRect(0, 0, 8, 8);
  c.fillStyle = '#e04df5'; c.fillRect(0, 3, 3, 1); c.fillRect(5, 3, 3, 1);
  c.fillStyle = '#ffffff'; c.fillRect(1, 3, 1, 1); c.fillRect(6, 3, 1, 1);
});

/* ---------- 전역 상태 ---------- */
let n = null, ctx = null, raf = 0, seq = 0;
let scene = null, camera = null, renderer = null;
let bowGroup = null, notchArrow = null;
let activeArrows = [];
let particles = [];
let droppedItems = [];
let torchLights = [];
let skySun = null, skyMoon = null;
let recoilImpulse = 0, cameraShake = 0;

/* ---------- 3D 마인크래프트 복셀 몹 팩토리 ---------- */
function makeLimb(w, h, d, mat, ox = 0, oy = 0, oz = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(ox, oy, oz);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(0, -h / 2, 0);
  pivot.add(mesh);
  return { pivot, mesh };
}

function buildMobModel(kind) {
  const root = new THREE.Group();
  const meshes = [];
  const mats = [];

  const regMat = (m) => { mats.push(m); return m; };
  const regMesh = (geom, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geom, regMat(mat));
    mesh.position.set(x, y, z);
    root.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  let head = null, leftArm = null, rightArm = null, leftLeg = null, rightLeg = null;
  let creeperLegs = [];
  let height = 2.0;

  if (kind === 'zombie') {
    const matGreen = new THREE.MeshLambertMaterial({ color: 0x5cb232 });
    const matShirt = new THREE.MeshLambertMaterial({ color: 0x20cbcf });
    const matPants = new THREE.MeshLambertMaterial({ color: 0x393275 });
    const matHead = [
      matGreen, matGreen, matGreen, matGreen,
      new THREE.MeshLambertMaterial({ map: TEX_ZOMBIE_FACE }), matGreen
    ];
    head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), matHead);
    head.position.set(0, 1.75, 0); root.add(head); meshes.push(head);

    regMesh(new THREE.BoxGeometry(0.7, 0.9, 0.35), matShirt, 0, 1.05, 0);
    leftArm = makeLimb(0.25, 0.85, 0.25, matShirt, -0.48, 1.45, 0);
    rightArm = makeLimb(0.25, 0.85, 0.25, matShirt, 0.48, 1.45, 0);
    leftArm.pivot.rotation.x = -Math.PI / 2;
    rightArm.pivot.rotation.x = -Math.PI / 2;
    root.add(leftArm.pivot); root.add(rightArm.pivot);
    meshes.push(leftArm.mesh, rightArm.mesh);

    leftLeg = makeLimb(0.28, 0.9, 0.28, matPants, -0.2, 0.9, 0);
    rightLeg = makeLimb(0.28, 0.9, 0.28, matPants, 0.2, 0.9, 0);
    root.add(leftLeg.pivot); root.add(rightLeg.pivot);
    meshes.push(leftLeg.mesh, rightLeg.mesh);
    height = 2.1;
  }
  else if (kind === 'skeleton') {
    const matBone = new THREE.MeshLambertMaterial({ color: 0xe8e4d2 });
    const matDark = new THREE.MeshLambertMaterial({ color: 0x444444 });
    const matHead = [
      matBone, matBone, matBone, matBone,
      new THREE.MeshLambertMaterial({ map: TEX_SKELETON_FACE }), matBone
    ];
    head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), matHead);
    head.position.set(0, 1.7, 0); root.add(head); meshes.push(head);

    regMesh(new THREE.BoxGeometry(0.55, 0.85, 0.28), matBone, 0, 1.05, 0);
    leftArm = makeLimb(0.18, 0.85, 0.18, matBone, -0.38, 1.45, 0);
    rightArm = makeLimb(0.18, 0.85, 0.18, matBone, 0.38, 1.45, 0);
    // 스켈레톤 미니 활
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), matDark);
    bowMesh.position.set(0, -0.4, 0.15);
    leftArm.pivot.add(bowMesh); meshes.push(bowMesh);
    leftArm.pivot.rotation.x = -Math.PI / 2 + 0.2;
    leftArm.pivot.rotation.y = 0.25;

    root.add(leftArm.pivot); root.add(rightArm.pivot);
    meshes.push(leftArm.mesh, rightArm.mesh);

    leftLeg = makeLimb(0.2, 0.9, 0.2, matBone, -0.16, 0.9, 0);
    rightLeg = makeLimb(0.2, 0.9, 0.2, matBone, 0.16, 0.9, 0);
    root.add(leftLeg.pivot); root.add(rightLeg.pivot);
    meshes.push(leftLeg.mesh, rightLeg.mesh);
    height = 2.05;
  }
  else if (kind === 'creeper') {
    const matGreen = new THREE.MeshLambertMaterial({ color: 0x6ade3e });
    const matHead = [
      matGreen, matGreen, matGreen, matGreen,
      new THREE.MeshLambertMaterial({ map: TEX_CREEPER_FACE }), matGreen
    ];
    head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), matHead);
    head.position.set(0, 1.45, 0); root.add(head); meshes.push(head);

    regMesh(new THREE.BoxGeometry(0.65, 0.85, 0.35), matGreen, 0, 0.82, 0);
    const legCoords = [
      [-0.2, 0.45, 0.2], [0.2, 0.45, 0.2],
      [-0.2, 0.45, -0.2], [0.2, 0.45, -0.2]
    ];
    creeperLegs = legCoords.map(([x, y, z]) => {
      const limb = makeLimb(0.22, 0.45, 0.22, matGreen, x, y, z);
      root.add(limb.pivot);
      meshes.push(limb.mesh);
      return limb;
    });
    height = 1.8;
  }
  else if (kind === 'enderman') {
    const matBlack = new THREE.MeshLambertMaterial({ color: 0x1e1e28 });
    const matHead = [
      matBlack, matBlack, matBlack, matBlack,
      new THREE.MeshLambertMaterial({ map: TEX_ENDERMAN_FACE, emissive: 0xd645f5, emissiveIntensity: 1.0 }), matBlack
    ];
    head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), matHead);
    head.position.set(0, 2.5, 0); root.add(head); meshes.push(head);

    regMesh(new THREE.BoxGeometry(0.45, 0.9, 0.22), matBlack, 0, 1.85, 0);
    leftArm = makeLimb(0.14, 1.4, 0.14, matBlack, -0.32, 2.25, 0);
    rightArm = makeLimb(0.14, 1.4, 0.14, matBlack, 0.32, 2.25, 0);
    root.add(leftArm.pivot); root.add(rightArm.pivot);
    meshes.push(leftArm.mesh, rightArm.mesh);

    leftLeg = makeLimb(0.15, 1.45, 0.15, matBlack, -0.15, 1.45, 0);
    rightLeg = makeLimb(0.15, 1.45, 0.15, matBlack, 0.15, 1.45, 0);
    root.add(leftLeg.pivot); root.add(rightLeg.pivot);
    meshes.push(leftLeg.mesh, rightLeg.mesh);
    height = 2.85;
  }

  const originalColors = meshes.map(m => Array.isArray(m.material) ? m.material.map(x => x.color.getHex()) : m.material.color.getHex());

  function setFlash(colorHex) {
    meshes.forEach((m) => {
      if (Array.isArray(m.material)) {
        m.material.forEach(mat => mat.color.setHex(colorHex || 0xffffff));
      } else {
        m.material.color.setHex(colorHex || 0xffffff);
      }
    });
  }

  function resetFlash() {
    meshes.forEach((m, i) => {
      const orig = originalColors[i];
      if (Array.isArray(m.material)) {
        m.material.forEach((mat, j) => mat.color.setHex(orig[j]));
      } else {
        m.material.color.setHex(orig);
      }
    });
  }

  function animate(t, spd) {
    const s = Math.sin(t * spd);
    if (kind === 'zombie') {
      leftLeg.pivot.rotation.x = s * 0.6;
      rightLeg.pivot.rotation.x = -s * 0.6;
      leftArm.pivot.rotation.x = -Math.PI / 2 + Math.sin(t * 3) * 0.06;
      rightArm.pivot.rotation.x = -Math.PI / 2 - Math.sin(t * 3) * 0.06;
      head.rotation.y = Math.sin(t * 1.5) * 0.08;
    } else if (kind === 'skeleton') {
      leftLeg.pivot.rotation.x = s * 0.65;
      rightLeg.pivot.rotation.x = -s * 0.65;
      rightArm.pivot.rotation.x = s * 0.35;
      head.rotation.y = Math.sin(t * 2) * 0.06;
    } else if (kind === 'creeper') {
      creeperLegs[0].pivot.rotation.x = s * 0.55;
      creeperLegs[1].pivot.rotation.x = -s * 0.55;
      creeperLegs[2].pivot.rotation.x = -s * 0.55;
      creeperLegs[3].pivot.rotation.x = s * 0.55;
      head.rotation.z = Math.sin(t * 3) * 0.04;
    } else if (kind === 'enderman') {
      leftLeg.pivot.rotation.x = s * 0.5;
      rightLeg.pivot.rotation.x = -s * 0.5;
      leftArm.pivot.rotation.x = -s * 0.4;
      rightArm.pivot.rotation.x = s * 0.4;
      head.rotation.y = Math.sin(t * 1.2) * 0.12;
    }
  }

  return { root, meshes, height, setFlash, resetFlash, animate };
}

/* ---------- 1인칭 활 & 스티브 팔 제작 ---------- */
function buildFirstPersonBow() {
  const g = new THREE.Group();
  const matCyan = new THREE.MeshLambertMaterial({ color: 0x00c4c7 });
  const matSkin = new THREE.MeshLambertMaterial({ color: 0xbc8965 });
  const matWood = new THREE.MeshLambertMaterial({ color: 0x936339 });
  const matDarkWood = new THREE.MeshLambertMaterial({ color: 0x54371c });
  const matString = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // 스티브 팔
  const armPivot = new THREE.Group();
  armPivot.position.set(0.18, -0.28, -0.32);
  armPivot.rotation.set(-0.4, -0.5, 0.35);

  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), matCyan);
  sleeve.position.set(0, 0, -0.12);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.16), matSkin);
  hand.position.set(0, 0, -0.32);
  armPivot.add(sleeve); armPivot.add(hand);
  g.add(armPivot);

  // 마인크래프트 활
  const bow = new THREE.Group();
  bow.position.set(-0.06, -0.06, -0.45);
  bow.rotation.set(0.15, 0.35, -0.2);

  const segGeom = new THREE.BoxGeometry(0.04, 0.12, 0.04);
  const addSeg = (x, y, z, mat = matWood, rx = 0) => {
    const s = new THREE.Mesh(segGeom, mat);
    s.position.set(x, y, z);
    s.rotation.z = rx;
    bow.add(s);
  };
  addSeg(0, 0, 0, matDarkWood);
  addSeg(-0.03, 0.11, 0, matWood, 0.25);
  addSeg(-0.08, 0.22, 0.02, matWood, 0.5);
  addSeg(-0.15, 0.31, 0.05, matDarkWood, 0.8);
  addSeg(-0.03, -0.11, 0, matWood, -0.25);
  addSeg(-0.08, -0.22, 0.02, matWood, -0.5);
  addSeg(-0.15, -0.31, 0.05, matDarkWood, -0.8);

  const stringGeom = new THREE.CylinderGeometry(0.005, 0.005, 0.72);
  const bowString = new THREE.Mesh(stringGeom, matString);
  bowString.position.set(-0.14, 0, 0.04);
  bow.add(bowString);

  const arrow = buildArrowMesh();
  arrow.position.set(-0.07, 0, -0.05);
  arrow.rotation.y = Math.PI;
  bow.add(arrow);
  notchArrow = arrow;

  g.add(bow);
  return { group: g, bow, bowString, notchArrow };
}

function buildArrowMesh() {
  const g = new THREE.Group();
  const matShaft = new THREE.MeshLambertMaterial({ color: 0x9e6a38 });
  const matFlint = new THREE.MeshLambertMaterial({ color: 0x666666 });
  const matFeather = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8), matShaft);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), matFlint);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -0.42;
  g.add(head);

  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.14), matFeather);
  f1.position.z = 0.32;
  const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.08, 0.14), matFeather);
  f2.position.z = 0.32;
  g.add(f1); g.add(f2);
  return g;
}

/* ---------- 3D 씬 환경 구축 ---------- */
function init3DScene(canvas) {
  const f = $('#ngField');
  const w = f.clientWidth || 800;
  const h = f.clientHeight || 380;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);

  scene = new THREE.Scene();
  // 환하고 맑은 마인크래프트 밤하늘 & 온화한 원거리 안개
  scene.background = new THREE.Color(0x182844);
  scene.fog = new THREE.Fog(0x182844, 18, 55);

  camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 75);
  camera.position.set(0, 1.6, 0);

  // 충분한 조명 (풍부한 밤하늘 환경광 + 밝은 달빛)
  const ambient = new THREE.AmbientLight(0x829ec8, 1.45);
  scene.add(ambient);
  const moonLight = new THREE.DirectionalLight(0xdde8ff, 1.15);
  moonLight.position.set(10, 22, -12);
  scene.add(moonLight);

  const fillLight = new THREE.DirectionalLight(0x48648e, 0.65);
  fillLight.position.set(-8, 14, 10);
  scene.add(fillLight);

  // 바닥 (넓고 산뜻한 마인크래프트 밤 잔디)
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x346322 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -22);
  scene.add(ground);

  // 3개 뚜렷한 길 (왼쪽, 중앙, 오른쪽 레인)
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x6e624f });
  [-7.0, 0, 7.0].forEach(px => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 60), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(px, 0.02, -22);
    scene.add(p);
  });

  // 플레이어 앞 나무 발판 & 난간
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x825932 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 4), deckMat);
  deck.position.set(0, -0.2, -1);
  scene.add(deck);

  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x563a21 });
  [-6.5, -3.5, 0, 3.5, 6.5].forEach(fx => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), fenceMat);
    post.position.set(fx, 0.55, -2.5);
    scene.add(post);
  });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.12, 0.12), fenceMat);
  rail.position.set(0, 0.9, -2.5);
  scene.add(rail);

  // 횃불 조명들 (플레이어 난간 + 전방 길목)
  torchLights = [];
  const addTorch = (tx, ty, tz, intensity = 1.4, dist = 12) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), fenceMat);
    post.position.set(tx, ty - 0.25, tz);
    scene.add(post);

    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), new THREE.MeshBasicMaterial({ color: 0xffaa22 }));
    flame.position.set(tx, ty + 0.1, tz);
    scene.add(flame);

    const light = new THREE.PointLight(0xffa544, intensity, dist);
    light.position.set(tx, ty + 0.2, tz);
    scene.add(light);
    torchLights.push(light);
  };

  // 플레이어 난간 횃불 2개
  addTorch(-5.2, 1.1, -2.4, 1.8, 14);
  addTorch(5.2, 1.1, -2.4, 1.8, 14);

  // 길목 전방 횃불 기둥 4개 (원거리 시야 확보)
  addTorch(-7.5, 1.2, -12, 1.5, 14);
  addTorch(7.5, 1.2, -12, 1.5, 14);
  addTorch(-7.5, 1.2, -24, 1.5, 14);
  addTorch(7.5, 1.2, -24, 1.5, 14);

  // 배경 숲 나무들
  const logMat = new THREE.MeshLambertMaterial({ color: 0x4a2e16 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f4716 });
  const addTree = (tx, tz) => {
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.8, 0.7), logMat);
    trunk.position.set(tx, 1.9, tz);
    const leaves = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 2.6), leafMat);
    leaves.position.set(tx, 4.4, tz);
    scene.add(trunk); scene.add(leaves);
  };
  [-11, -13, -15, 11, 13, 15].forEach((tx, i) => {
    addTree(tx, -14 - (i % 3) * 8);
  });

  // 네모난 마인크래프트 달
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xfbf8d6 });
  skyMoon = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 4.0), moonMat);
  skyMoon.position.set(12, 18, -36);
  skyMoon.lookAt(camera.position);
  scene.add(skyMoon);

  // 떠오를 해 (클리어 시 사용)
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffec44 });
  skySun = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), sunMat);
  skySun.position.set(0, -6, -40);
  skySun.lookAt(camera.position);
  scene.add(skySun);

  // 1인칭 활 생성 & 카메라에 추가
  const fpsBow = buildFirstPersonBow();
  bowGroup = fpsBow.group;
  camera.add(bowGroup);
  scene.add(camera);
}

/* ---------- 시작·끝 ---------- */
export function startNight(c, mode = 'ko', speed = 'normal') {
  if (['slow', 'normal', 'fast'].includes(mode) && speed === 'normal') {
    speed = mode;
    mode = 'ko';
  }
  ctx = c;
  stopNight();
  const order = c.pickWords(c.words.length);
  n = {
    mode, speed: SPEEDS[speed] ? speed : 'normal', order, oi: 0, t: 0, last: 0, over: false,
    mobs: [], spawned: 0, killed: 0, reached: 0, hearts: HEARTS, nextSpawn: 1.2,
    opts: [], lock: 0, missed: [], combo: 0, best: 0, mobOrder: shuffle(MOB_TYPES),
    dawnProgress: 0, lastLane: -1
  };

  const canvas = $('#ngCanvas3D');
  init3DScene(canvas);

  $('#ngSigns').innerHTML = '';
  $('#ngOver').hidden = true;
  $('#ngField').classList.remove('dawn', 'hurt');
  $('#ngFb').textContent = '';

  if (mode === 'en') {
    const distinct = [];
    const usedKo = new Set();
    for (const w of order) {
      if (!usedKo.has(w.ko)) {
        usedKo.add(w.ko);
        distinct.push(w);
        if (distinct.length === 4) break;
      }
    }
    n.opts = distinct.length === 4 ? distinct : shuffle(order.slice(0, 4));
  } else {
    n.opts = shuffle(order.slice(0, 4));
  }

  drawOpts();
  drawBar();
  raf = requestAnimationFrame(tick);
}

export function stopNight() {
  cancelAnimationFrame(raf);
  if (n) n.over = true;
  if (scene) {
    activeArrows = [];
    particles = [];
    droppedItems = [];
    if (renderer) renderer.dispose();
    scene = null; camera = null; renderer = null; bowGroup = null;
  }
  const signs = $('#ngSigns');
  if (signs) signs.innerHTML = '';
}

/* ---------- UI 그리기 ---------- */
function drawBar() {
  $('#ngHearts').innerHTML = Array.from({ length: HEARTS }, (_, i) => `<i class="${i < n.hearts ? '' : 'lost'}">${HEART}</i>`).join('');
  $('#ngHearts').setAttribute('aria-label', `하트 ${n.hearts}개`);
  $('#ngCount').textContent = `물리친 몹 ${n.killed} / ${TOTAL}`;
}

function drawOpts() {
  const isEnMode = n.mode === 'en';
  $('#ngOpts').innerHTML = n.opts.map((w, k) =>
    `<button type="button" class="wg-opt ng-opt ${MATERIALS[k]}" data-k="${k}" ${isEnMode ? '' : 'lang="en"'}><span class="key" aria-hidden="true">${k + 1}</span><span class="lbl">${esc(isEnMode ? w.ko : w.en)}</span></button>`).join('');
}

function setOpt(k, w) {
  n.opts[k] = w;
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);
  if (!b) return;
  const isEnMode = n.mode === 'en';
  b.querySelector('.lbl').textContent = isEnMode ? w.ko : w.en;
  if (isEnMode) b.removeAttribute('lang'); else b.setAttribute('lang', 'en');
  b.classList.remove('swap'); void b.offsetWidth; b.classList.add('swap');
}

/* ---------- 몹 스폰 & 관리 ---------- */
const alive = () => n.mobs.filter(m => m.state === 'walk' || m.state === 'fuse');

function nextWord() {
  const onField = new Set(alive().map(m => m.w.key));
  for (let k = 0; k < n.order.length; k++) {
    const w = n.order[(n.oi + k) % n.order.length];
    if (!onField.has(w.key)) { n.oi = (n.oi + k + 1) % n.order.length; return w; }
  }
  return n.order[0];
}

function spawn() {
  const w = nextWord();
  // 3개 레인에 몹을 고르게 분산 (현재 몹이 없는 레인 우선 + 직전 레인 회피)
  const activeLanes = alive().map(m => m.lane);
  const freeLanes = [0, 1, 2].filter(l => !activeLanes.includes(l));
  let lane;
  if (freeLanes.length > 0) {
    const prefer = freeLanes.filter(l => l !== n.lastLane);
    lane = prefer.length ? prefer[Math.floor(Math.random() * prefer.length)] : freeLanes[0];
  } else {
    const sorted = [...alive()].sort((a, b) => a.z - b.z);
    lane = sorted[0].lane;
  }
  n.lastLane = lane;

  const base = SPEEDS[n.speed];
  const walkDur = base.walk * (1 - 0.28 * (n.spawned / TOTAL));
  const type = n.mobOrder[n.spawned % n.mobOrder.length];

  const model = buildMobModel(type.kind);
  const laneCfg = LANES_CONFIG[lane];
  const startX = laneCfg.startX;
  model.root.position.set(startX, 0, Z_SPAWN);
  scene.add(model.root);

  // 3D 연동 DOM 간판 (질문 표시용, 클릭으로 자동 정답 제출되지 않음)
  const signEl = document.createElement('div');
  signEl.className = 'ng-sign3d';
  const signText = n.mode === 'en' ? w.en : w.ko;
  if (n.mode === 'en') signEl.setAttribute('lang', 'en');
  signEl.textContent = signText;
  $('#ngSigns').appendChild(signEl);

  const m = {
    id: ++seq, w, type, lane, x: startX, z: Z_SPAWN,
    walkDur, model, signEl, state: 'walk',
    fuseTimer: 0, hitTimer: 0, dieTimer: 0
  };

  n.mobs.push(m);
  n.spawned++;
  ensureAnswers();
}

function ensureAnswers() {
  const need = alive().map(m => m.w);
  const needKeys = new Set(need.map(w => w.key));
  for (const w of need) {
    if (n.opts.some(o => o.key === w.key)) continue;
    const spare = n.opts.map((o, k) => k).filter(k => !needKeys.has(n.opts[k].key));
    if (!spare.length) break;
    setOpt(spare[Math.floor(Math.random() * spare.length)], w);
  }
}

function refreshOpt(k) {
  const inOpts = new Set(n.opts.map(o => o.key));
  const need = alive().map(m => m.w).filter(w => !inOpts.has(w.key));
  let pool = need.length ? need : shuffle(n.order.filter(w => !inOpts.has(w.key)));
  if (n.mode === 'en') {
    const currentKos = new Set(n.opts.map((o, idx) => idx !== k ? o.ko : null).filter(Boolean));
    const nonDup = pool.filter(w => !currentKos.has(w.ko));
    if (nonDup.length) pool = nonDup;
  }
  if (pool.length) setOpt(k, pool[0]);
}

/* ---------- 화살 발사 & 애니메이션 ---------- */
function choose(k) {
  if (!n || n.over || performance.now() < n.lock) return;
  const w = n.opts[k];
  const b = $('#ngOpts').querySelector(`[data-k="${k}"]`);

  // 가장 가까운 동일 단어 몹 타겟
  const m = alive().filter(x => x.w.key === w.key).sort((a, c) => c.z - a.z)[0];
  if (!m) {
    sfx('bad');
    n.lock = performance.now() + 600;
    n.combo = 0;
    b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
    setTimeout(() => b.classList.remove('wrong'), 600);
    $('#ngFb').innerHTML = `<b lang="en">${esc(w.en)}</b> = ${esc(w.ko)} · 이 ${n.mode === 'en' ? '단어' : '뜻'}의 몹은 없어요`;
    return;
  }

  n.combo++; n.best = Math.max(n.best, n.combo);
  b.classList.remove('right'); void b.offsetWidth; b.classList.add('right');
  setTimeout(() => b.classList.remove('right'), 400);
  $('#ngFb').innerHTML = `<b lang="en">${esc(w.en)}</b> = ${esc(w.ko)}${n.combo >= 3 ? ` · ${n.combo}연속 명중!` : ''}`;

  // 활 쏘기 사운드 & 손 반동
  sfx('bow');
  recoilImpulse = 0.28;
  setTimeout(() => sfx('shoot'), 70);

  launchArrow(m);
  refreshOpt(k);
}

function launchArrow(targetMob) {
  const mesh = buildArrowMesh();
  mesh.position.set(0.28, 1.32, -0.7);
  scene.add(mesh);

  const start = mesh.position.clone();
  const end = new THREE.Vector3(targetMob.x, targetMob.model.height * 0.6, targetMob.z);
  const mid = start.clone().lerp(end, 0.5);
  mid.y += 0.8;

  activeArrows.push({
    mesh, targetMob, start, mid, end,
    t: 0, dur: 0.26
  });
}

function hitMob(m) {
  m.state = 'hit';
  m.hitTimer = 0.16;
  m.model.setFlash(0xff2222);
  m.signEl.classList.add('hit');
  m.z -= 1.4; // 넉백
  const progress = Math.min(1, Math.max(0, (m.z - Z_SPAWN) / (Z_REACH - Z_SPAWN)));
  m.x = LANES_CONFIG[m.lane].startX + (LANES_CONFIG[m.lane].endX - LANES_CONFIG[m.lane].startX) * progress;
  m.model.root.position.set(m.x, 0, m.z);
  sfx('hit');

  setTimeout(() => {
    killMob(m);
  }, 140);
}

function killMob(m) {
  m.state = 'die';
  m.dieTimer = 0.35;
  sfx('poof');
  n.killed++;
  ctx.recordWord(m.w, true);
  ctx.say(m.w.en);
  drawBar();

  createPoofParticles(m.x, 1.0, m.z, m.type.kind === 'enderman' ? 0xd645f5 : 0xffffff);
  spawnDroppedItem(m.x, 0.8, m.z, m.type.kind);
  m.signEl.remove();
}

function spawnDroppedItem(x, y, z, kind) {
  const color = kind === 'zombie' ? 0xb04422
    : kind === 'skeleton' ? 0xebe8d8
    : kind === 'creeper' ? 0x555555
    : 0x118877;
  const geom = new THREE.BoxGeometry(0.25, 0.25, 0.25);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  droppedItems.push({ mesh, t: 0, startPos: mesh.position.clone() });
}

function createPoofParticles(x, y, z, color = 0xffffff, count = 12) {
  const geom = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const p = new THREE.Mesh(geom, mat);
    p.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 3 + 1,
      (Math.random() - 0.5) * 4
    );
    scene.add(p);
    particles.push({ mesh: p, vel, life: 0.45, maxLife: 0.45 });
  }
}

function reach(m) {
  if (m.type.kind === 'creeper') {
    m.state = 'fuse';
    m.fuseTimer = 0.85;
    sfx('fuse');
    return;
  }
  mobBreach(m);
}

function explodeCreeper(m) {
  m.state = 'gone';
  sfx('explode');
  createPoofParticles(m.x, 1.2, m.z, 0xffbb22, 24);
  cameraShake = 0.45;
  scene.remove(m.model.root);
  m.signEl.remove();

  applyDamage(m, '크리퍼가 집 앞에서 폭발했어요!');
}

function mobBreach(m) {
  m.state = 'gone';
  sfx('hurt');
  scene.remove(m.model.root);
  m.signEl.remove();

  const p = ['스켈레톤', '엔더맨'].includes(m.type.name) ? '이' : '가';
  applyDamage(m, `${m.type.name}${p} 집에 닿았어요!`);
}

function applyDamage(m, msg) {
  n.combo = 0;
  n.missed.push(m.w);
  ctx.recordWord(m.w, false);

  const f = $('#ngField');
  f.classList.remove('hurt'); void f.offsetWidth; f.classList.add('hurt');
  $('#ngFb').innerHTML = `${msg} <b lang="en">${esc(m.w.en)}</b> = ${esc(m.w.ko)}`;

  n.hearts--;
  n.reached++;
  drawBar();
  if (n.hearts <= 0) gameOver();
}

/* ---------- 메인 루프 (tick) ---------- */
function tick(now) {
  if (!n || n.over) return;
  const dt = n.last ? Math.min(0.1, (now - n.last) / 1000) : 0;
  n.last = now;
  n.t += dt;

  const a = alive();
  if (n.spawned < TOTAL && a.length < MAX_ALIVE && (n.t >= n.nextSpawn || (!a.length && n.t >= n.nextSpawn - 2))) {
    spawn();
    const g = SPEEDS[n.speed].gap;
    n.nextSpawn = n.t + g * (0.8 + Math.random() * 0.4);
  }
  const canCall = n.spawned < TOTAL && alive().length < MAX_ALIVE;
  const cb = $('#ngCall');
  if (cb.disabled === canCall) cb.disabled = !canCall;

  // 횃불 깜빡임 효과
  torchLights.forEach((tl, i) => {
    tl.intensity = 1.3 + Math.sin(n.t * 12 + i * 2) * 0.2 + (Math.random() - 0.5) * 0.08;
  });

  // 1인칭 활 흔들림 & 반동
  if (bowGroup) {
    if (recoilImpulse > 0) {
      recoilImpulse = Math.max(0, recoilImpulse - dt * 2.2);
    }
    const swayY = Math.sin(n.t * 2.2) * 0.008;
    const swayX = Math.cos(n.t * 1.1) * 0.005;
    bowGroup.position.set(0.38 + swayX, -0.32 + swayY, -0.65 + recoilImpulse * 0.18);
    bowGroup.rotation.x = -recoilImpulse * 0.4;
  }

  // 카메라 쉐이크
  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - dt * 1.8);
    camera.position.x = (Math.random() - 0.5) * cameraShake * 0.4;
    camera.position.y = 1.6 + (Math.random() - 0.5) * cameraShake * 0.4;
  } else {
    camera.position.set(0, 1.6, 0);
  }

  // 뷰포트 반응형 크기 자동 갱신
  const fw = $('#ngField').clientWidth || 800;
  const fh = $('#ngField').clientHeight || 380;
  if (renderer && camera) {
    const pr = renderer.getPixelRatio();
    if (renderer.domElement.width !== Math.floor(fw * pr) || renderer.domElement.height !== Math.floor(fh * pr)) {
      camera.aspect = fw / fh;
      camera.updateProjectionMatrix();
      renderer.setSize(fw, fh, false);
    }
  }

  // 몹 업데이트 (넓은 레인 이동, 걷기, 간판 3D 투영)
  for (const m of n.mobs) {
    if (m.state === 'walk') {
      const spd = (Z_REACH - Z_SPAWN) / m.walkDur;
      m.z += dt * spd;
      const progress = Math.min(1, Math.max(0, (m.z - Z_SPAWN) / (Z_REACH - Z_SPAWN)));
      const laneCfg = LANES_CONFIG[m.lane];
      m.x = laneCfg.startX + (laneCfg.endX - laneCfg.startX) * progress;
      m.model.root.position.set(m.x, 0, m.z);
      m.model.animate(n.t, 7);

      if (m.z >= Z_REACH) reach(m);
    } else if (m.state === 'fuse') {
      m.fuseTimer -= dt;
      const p = 1 - m.fuseTimer / 0.85;
      const flash = Math.floor(n.t * 18) % 2 === 0;
      if (flash) m.model.setFlash(0xffffff); else m.model.resetFlash();
      const s = 1 + p * 0.55;
      m.model.root.scale.set(s, s, s);

      if (m.fuseTimer <= 0) explodeCreeper(m);
    } else if (m.state === 'die') {
      m.dieTimer -= dt;
      m.model.root.rotation.z = Math.min(Math.PI / 2, m.model.root.rotation.z + dt * 5);
      m.model.root.position.y = Math.max(-0.4, m.model.root.position.y - dt * 1.2);
      if (m.dieTimer <= 0) {
        scene.remove(m.model.root);
        m.state = 'gone';
      }
    }

    // 3D 위치를 2D 화면 좌표로 투영해 간판 배치
    if (m.signEl && (m.state === 'walk' || m.state === 'fuse')) {
      const v = m.model.root.position.clone();
      v.y += m.model.height + 0.5;
      v.project(camera);

      const sx = (v.x * 0.5 + 0.5) * fw;
      const sy = (-v.y * 0.5 + 0.5) * fh;
      const dist = Math.abs(m.z - camera.position.z);
      const scale = Math.max(0.72, Math.min(1.22, 28 / dist));

      m.signEl.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      m.signEl.style.left = `${sx.toFixed(1)}px`;
      m.signEl.style.top = `${sy.toFixed(1)}px`;
      m.signEl.style.zIndex = Math.round(100 - m.z);
    }
  }

  // 날아가는 화살 처리
  for (let i = activeArrows.length - 1; i >= 0; i--) {
    const a = activeArrows[i];
    a.t += dt / a.dur;
    const t = Math.min(1, a.t);

    const p0 = a.start, p1 = a.mid, p2 = a.end;
    const cur = new THREE.Vector3(
      (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
      (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
      (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * p1.z + t * t * p2.z
    );
    const tangent = new THREE.Vector3(
      2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
      2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
      2 * (1 - t) * (p1.z - p0.z) + 2 * t * (p2.z - p1.z)
    ).normalize();

    a.mesh.position.copy(cur);
    a.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tangent);

    if (t >= 1) {
      scene.remove(a.mesh);
      activeArrows.splice(i, 1);
      hitMob(a.targetMob);
    }
  }

  // 드랍 아이템 자석 흡수 연출
  for (let i = droppedItems.length - 1; i >= 0; i--) {
    const item = droppedItems[i];
    item.t += dt * 2.2;
    item.mesh.rotation.x += dt * 4;
    item.mesh.rotation.y += dt * 5;
    const camPos = new THREE.Vector3(0, 1.2, 0);
    item.mesh.position.lerpVectors(item.startPos, camPos, Math.min(1, item.t));
    if (item.t >= 1) {
      scene.remove(item.mesh);
      droppedItems.splice(i, 1);
      sfx('tink');
    }
  }

  // 파티클 업데이트
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= dt * 6;
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }

  // 클리어 시 새벽 해돋이 연출
  if (n.dawnProgress > 0) {
    n.dawnProgress = Math.min(1, n.dawnProgress + dt * 0.6);
    skySun.position.y = -6 + n.dawnProgress * 15;
    scene.background.lerpColors(new THREE.Color(0x182844), new THREE.Color(0x824e2c), n.dawnProgress);
    scene.fog.color.lerpColors(new THREE.Color(0x182844), new THREE.Color(0xe0843e), n.dawnProgress);
  }

  renderer.render(scene, camera);

  if (n.spawned >= TOTAL && !n.mobs.some(m => m.state !== 'gone')) {
    return morning();
  }
  raf = requestAnimationFrame(tick);
}

/* ---------- '몹 부르기' ---------- */
function callNext() {
  if (!n || n.over || n.spawned >= TOTAL || alive().length >= MAX_ALIVE) return;
  spawn();
  sfx('switch');
  n.nextSpawn = n.t + SPEEDS[n.speed].gap * (0.8 + Math.random() * 0.4);
  if (n.spawned >= TOTAL || alive().length >= MAX_ALIVE) $('#ngCall').disabled = true;
}

/* ---------- 종료 & 결과 ---------- */
function finish(win) {
  n.over = true;
  $('#ngOpts').querySelectorAll('button').forEach(b => { b.disabled = true; });
  $('#ngCall').disabled = true;
  const over = $('#ngOver');
  over.querySelector('p').textContent = win ? '아침이 왔어요!' : '집이 다 부서졌어요!';
  over.hidden = false;

  if (win) {
    n.dawnProgress = 0.05;
    $('#ngField').classList.add('dawn');
  }
  sfx(win ? 'win' : 'end');

  if (!win) {
    alive().forEach(m => {
      m.state = 'gone';
      n.missed.push(m.w);
      ctx.recordWord(m.w, false);
    });
  }

  const r = { win, killed: n.killed, hearts: n.hearts, best: n.best, missed: n.missed, total: TOTAL, sec: Math.round(n.t) };
  setTimeout(() => { if (ctx) ctx.onEnd(r); }, 2200);
}

const morning = () => finish(true);
const gameOver = () => finish(false);

/* ---------- 이벤트 리스너 ---------- */
$('#ngOpts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (b && !b.disabled) choose(Number(b.dataset.k));
});

document.addEventListener('keydown', (e) => {
  if ($('#night').hidden || !n || n.over || e.altKey || e.ctrlKey || e.metaKey) return;
  const k = Number(e.key);
  if (k >= 1 && k <= 4) { choose(k - 1); e.preventDefault(); }
  else if (e.key === ' ' || e.key === 'Enter') { callNext(); e.preventDefault(); }
});

$('#ngCall').addEventListener('click', callNext);
