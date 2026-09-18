import { STAGES } from '../app.js';

export class Stage02 {
    constructor(game) {
        this.game = game;
        this.completed = false;
        this.timer = null;
        this.substep = 0;
        this.dialedNumber = '';
        this.inputBlocked = false;
    }

    start() {
        this.completed = false;
        this.substep = 0;
        this.dialedNumber = '';
        this.inputBlocked = false;

        this.game.setPlayerPosition(0, 0, 8);
        this.game.setCameraRotation(0, 0);

        this.game.showTask(
            'Етап 2: Виявлено підозрілий предмет (міна "Пелюстка"). ' +
            'Ні в якому разі не підходьте! Зупиніться, обережно відійдіть назад на безпечну відстань (не менше 15 метрів) та викличте екстрену службу.'
        );

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.checkPositionInterval = setInterval(() => {
            if (this.completed) return;

            const playerPos = this.game.getPlayerPosition();
            const hazardPos = { x: 0, z: -2 };
            const dist = Math.hypot(playerPos.x - hazardPos.x, playerPos.z - hazardPos.z);

            if (dist < 4.5 && this.substep === 0) {
                this.game.showWarning('Небезпечно близько! Не підходьте до міни! Відійдіть назад.');
                if (this.game.audio) this.game.audio.playWarning();
            }

            if (dist >= 14 && this.substep === 0) {
                this.substep = 1;
                this.game.showInfo('Ви на безпечній відстані. Тепер повідомте екстрену службу про знахідку.');
                this.openPhoneDialer();
            }
        }, 200);
    }

    openPhoneDialer() {
        const existingModal = document.getElementById('stage-phone-modal');
        if (existingModal) existingModal.remove();

        this.dialedNumber = '';

        const modal = document.createElement('div');
        modal.id = 'stage-phone-modal';
        modal.className = 'phone-dialer-backdrop';
        modal.innerHTML = `
            <div class="phone-dialer-window">
                <div class="phone-top-bar">
                    <span class="phone-network">SOS ONLY</span>
                    <span class="phone-title">Телефонний виклик</span>
                </div>
                <div class="phone-screen-display" id="dialerScreen">_</div>
                <div class="phone-keyboard-grid">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map(val => `
                        <button class="phone-key-btn" data-digit="${val}">${val}</button>
                    `).join('')}
                </div>
                <div class="phone-bottom-actions">
                    <button class="phone-action-btn btn-backspace" id="btnDialerBackspace" title="Стерти">⌫</button>
                    <button class="phone-action-btn btn-call-trigger" id="btnDialerCall" title="Подзвонити">📞</button>
                </div>
                <div class="phone-prompt-tip">Наберіть номер рятувальної служби</div>
            </div>
        `;

        document.body.appendChild(modal);

        const screen = modal.querySelector('#dialerScreen');

        modal.querySelectorAll('.phone-key-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.inputBlocked) return;
                const digit = btn.getAttribute('data-digit');
                if (this.dialedNumber.length < 4) {
                    this.dialedNumber += digit;
                    screen.textContent = this.dialedNumber;
                    if (this.game.audio && this.game.audio.playBeep) {
                        this.game.audio.playBeep();
                    }
                }
            });
        });

        modal.querySelector('#btnDialerBackspace').addEventListener('click', () => {
            if (this.inputBlocked) return;
            this.dialedNumber = this.dialedNumber.slice(0, -1);
            screen.textContent = this.dialedNumber || '_';
        });

        modal.querySelector('#btnDialerCall').addEventListener('click', () => {
            if (this.inputBlocked) return;
            this.handleCallSubmission(modal, screen);
        });
    }

    handleCallSubmission(modal, screen) {
        if (this.dialedNumber === '101' || this.dialedNumber === '112') {
            this.inputBlocked = true;
            screen.textContent = 'З\'єднання...';
            if (this.game.audio && this.game.audio.playPhoneRing) {
                this.game.audio.playPhoneRing();
            }

            setTimeout(() => {
                modal.remove();
                this.game.showSuccess('Вірно! Ви викликали службу порятунку за номером ' + this.dialedNumber + '. Завжди тримайтеся безпечної відстані!');
                this.finishStage();
            }, 1200);
        } else if (this.dialedNumber === '102') {
            this.inputBlocked = true;
            screen.textContent = 'Поліція...';
            setTimeout(() => {
                modal.remove();
                this.game.showWarning('Ви викликали поліцію (102). Це прийнятно, але пряма профільна служба розмінування — ДСНС (101) або єдиний номер 112.');
                this.finishStage();
            }, 1200);
        } else {
            if (this.game.audio && this.game.audio.playError) {
                this.game.audio.playError();
            }
            screen.textContent = 'ПОМИЛКА';
            this.game.showWarning('Неправильний номер екстреної служби. Наберіть 101 або 112!');
            setTimeout(() => {
                this.dialedNumber = '';
                screen.textContent = '_';
            }, 900);
        }
    }

    finishStage() {
        this.completed = true;
        this.cleanup();
        this.game.onStageComplete(2);
    }

    cleanup() {
        if (this.checkPositionInterval) {
            clearInterval(this.checkPositionInterval);
            this.checkPositionInterval = null;
        }
        const modal = document.getElementById('stage-phone-modal');
        if (modal) modal.remove();
    }
}
