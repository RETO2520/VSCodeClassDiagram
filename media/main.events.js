/**
 * Simple EventEmitter for module communication
 */
export class EventEmitter {
    constructor() {
        /** @type {Object.<string, Array<Function>>} */
        this.listeners = {};
    }

    /**
     * Subscribe to an event
     * @param {string} event 
     * @param {Function} callback 
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event 
     * @param {Function} callback 
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event
     * @param {string} event 
     * @param {any} [data] 
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(data));
    }
}

// Singleton instance for global events
export const events = new EventEmitter();
