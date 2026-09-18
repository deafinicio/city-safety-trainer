import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

export class Game3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.colliders = [];
        this.player = {
            position: new THREE.Vector3(0, 1.6, 0),
            velocity: new THREE.Vector3(),
            radius: 0.45,
            height: 1.7
        };
        this.keys = {};
        this.yaw = 0;
        this.pitch = 0;
        this.isPointerLocked = false;

        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xd6e6f2);
        this.scene.fog = new THREE.FogExp2(0xd6e6f2, 0.015);

        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.copy(this.player.position);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        this.setupLights();
        this.setupControls();
        this.animate = this.animate.bind(this);
        requestAnimationFrame(this.animate);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLights() {
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.6);
        hemiLight.position.set(0, 50, 0);
        this.scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xfffaed, 0.8);
        dirLight.position.set(20, 40, 20);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 150;
        const d = 30;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        this.scene.add(dirLight);
    }

    setupControls() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        this.renderer.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.renderer.domElement);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isPointerLocked) return;
            const sensitivity = 0.0022;
            this.yaw -= e.movementX * sensitivity;
            this.pitch -= e.movementY * sensitivity;
            this.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.pitch));
        });
    }

    /**
     * Повна реєстрація всіх фізичних перешкод на сцені.
     * Запобігає проходженню крізь лавки, таблички, стіни, бордюри та паркани.
     */
    refreshColliders() {
        this.colliders = [];
        this.scene.traverse((node) => {
            if (!node.isMesh || node.name === 'ground' || node.name === 'terrain') return;

            const name = (node.name || '').toLowerCase();
            const parentName = (node.parent && node.parent.name ? node.parent.name : '').toLowerCase();

            const isObstacle = 
                node.userData.isCollider ||
                node.userData.collidable === true ||
                name.includes('wall') ||
                name.includes('bench') ||
                name.includes('curb') ||
                name.includes('sign') ||
                name.includes('post') ||
                name.includes('fence') ||
                name.includes('tree') ||
                name.includes('building') ||
                name.includes('barrier') ||
                parentName.includes('bench') ||
                parentName.includes('sign') ||
                parentName.includes('fence');

            if (isObstacle) {
                node.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(node);

                // Бордюри і низькі предмети піднімаємо вгору в BoundingBox, щоб гравець не міг через них "переступити"
                if (bbox.max.y - bbox.min.y < 0.4) {
                    bbox.max.y += 0.8;
                }

                // Розширюємо дуже тонкі таблички / огорожі для уникнення тунелювання
                if (bbox.max.x - bbox.min.x < 0.15) {
                    bbox.min.x -= 0.1;
                    bbox.max.x += 0.1;
                }
                if (bbox.max.z - bbox.min.z < 0.15) {
                    bbox.min.z -= 0.1;
                    bbox.max.z += 0.1;
                }

                this.colliders.push(bbox);
            }
        });
    }

    testPlayerCollision(candidatePos) {
        const r = this.player.radius;
        const playerMin = new THREE.Vector3(candidatePos.x - r, candidatePos.y - 1.5, candidatePos.z - r);
        const playerMax = new THREE.Vector3(candidatePos.x + r, candidatePos.y + 0.3, candidatePos.z + r);
        const pBox = new THREE.Box3(playerMin, playerMax);

        for (let i = 0; i < this.colliders.length; i++) {
            if (this.colliders[i].intersectsBox(pBox)) {
                return true;
            }
        }
        return false;
    }

    updatePlayerMovement(delta) {
        const speed = 4.2;
        const moveVector = new THREE.Vector3();

        if (this.keys['KeyW'] || this.keys['ArrowUp']) moveVector.z -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) moveVector.z += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveVector.x -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) moveVector.x += 1;

        if (moveVector.lengthSq() > 0) {
            moveVector.normalize();
            moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

            const stepX = moveVector.x * speed * delta;
            const stepZ = moveVector.z * speed * delta;

            // Окрема перевірка по X для ковзання вздовж стін/бордюрів
            const candidateX = this.player.position.clone();
            candidateX.x += stepX;
            if (!this.testPlayerCollision(candidateX)) {
                this.player.position.x = candidateX.x;
            }

            // Окрема перевірка по Z
            const candidateZ = this.player.position.clone();
            candidateZ.z += stepZ;
            if (!this.testPlayerCollision(candidateZ)) {
                this.player.position.z = candidateZ.z;
            }
        }

        this.camera.position.copy(this.player.position);
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
    }

    animate(time) {
        requestAnimationFrame(this.animate);
        const delta = Math.min((this.lastTime ? (time - this.lastTime) / 1000 : 0.016), 0.1);
        this.lastTime = time;

        this.updatePlayerMovement(delta);
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    setPlayerPosition(x, y, z) {
        this.player.position.set(x, y + 1.6, z);
        this.camera.position.copy(this.player.position);
    }

    getPlayerPosition() {
        return {
            x: this.player.position.x,
            y: this.player.position.y - 1.6,
            z: this.player.position.z
        };
    }

    setCameraRotation(yaw, pitch) {
        this.yaw = yaw;
        this.pitch = pitch;
    }

    clearScene() {
        while (this.scene.children.length > 0) {
            const obj = this.scene.children[0];
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
            this.scene.remove(obj);
        }
        this.colliders = [];
        this.setupLights();
    }
}
