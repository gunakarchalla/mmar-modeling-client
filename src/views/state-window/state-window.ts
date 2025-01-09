import { GlobalStateObject } from './../../resources/global_state_object';
export class StateWindow {

    private buttonColor = "";

    constructor(
        private globalStateObject : GlobalStateObject,
    ) {
    }

    attached() {
        this.blinkInfoButton();
    }

    viewClicked() {
        this.globalStateObject.setState(1);
    }

    blinkInfoButton() {
        // switch 10 times between red and "" every 0.5 seconds
        let i = 0;
        const interval = setInterval(() => {
            if (i % 2 === 0) {
                this.buttonColor = "red";
            } else {
                this.buttonColor = "";
            }
            i++;
            if (i === 20) {
                clearInterval(interval);
            }
        }, 500);

        interval;

    }
}