import { EventAggregator } from "aurelia";

export class DialogLoadingWindow {

    private open = false;
    private buffer = 0;
    private progress = 0;

    constructor(
        private eventAggregator: EventAggregator
    ) { }

    async attached() {
        //subscribe to event aggregator from this -> this.eventAggregator.publish('...', payload);
        this.eventAggregator.subscribe('openDialogLoadingWindow', async payload => { await this.initProgressBar(); });
    }

    async initProgressBar() {
        this.open = true;
        this.updateProgressBar();
    }

    // function to increase the values of the progress and buffer gradually to fool the user
    // the progress bar will get slower the closer it gets to 100%
    async updateProgressBar() {
        let delay = 0;
        if (this.open) {
            if (this.progress < 0.99) { // Adjusted to prevent reaching 100%
                if (this.progress < 0.50) {
                    this.progress += 0.1;
                    this.buffer += 0.1;
                    delay = 500;
                } else if (this.progress < 0.80) {
                    this.progress += 0.05;
                    this.buffer += 0.05;
                    delay = 1000;
                } else {
                    this.progress += 0.02 * (1 - this.progress); // Smaller increment as it approaches 100%
                    this.buffer += 0.02 * (1 - this.progress);
                    delay = 1500;
                }
                setTimeout(() => { this.updateProgressBar(); }, delay);
            } else {
                this.progress = 0.99; // Cap the progress at 99%
                this.buffer = 0.99;
            }
        }
    }
}