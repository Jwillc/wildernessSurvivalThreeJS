export class Inventory {
    constructor() {
        this.slots = new Array(5).fill(null);
        this.slotElements = Array.from(document.getElementsByClassName('inventory-slot'));
        this.unlimitedLogs = false; // Flag for unlimited logs cheat
    }

    addItem(item, count = 1) {
        // If item is a string, convert it to an Item object
        const itemObj = typeof item === 'string' ? new Item(item) : item;

        let added = 0;

        for (let i = 0; i < count; i++) {
            const emptySlot = this.slots.findIndex(slot => slot === null);
            if (emptySlot !== -1) {
                this.slots[emptySlot] = typeof item === 'string' ? new Item(item) : {...itemObj};
                added++;
            } else {
                break; // No more empty slots
            }
        }

        this.updateUI();
        return added > 0;
    }

    removeItem(itemType) {
        // If unlimited logs is enabled and we're removing logs, pretend it worked
        if (this.unlimitedLogs && itemType === 'log') {
            return true;
        }

        const itemSlot = this.slots.findIndex(slot => slot?.type === itemType);
        if (itemSlot !== -1) {
            this.slots[itemSlot] = null;
            this.updateUI();
            return true;
        }
        return false;
    }

    hasItems(items) {
        return items.every(itemType => {
            // If unlimited logs is enabled and we're checking for logs, always return true
            if (this.unlimitedLogs && itemType === 'log') {
                return true;
            }
            return this.slots.some(slot => slot?.type === itemType);
        });
    }

    getItemCount(itemType) {
        // If unlimited logs is enabled and we're counting logs, return a large number
        if (this.unlimitedLogs && itemType === 'log') {
            return 999;
        }
        return this.slots.filter(slot => slot?.type === itemType).length;
    }

    updateUI() {
        this.slots.forEach((item, index) => {
            const count = item ? this.getItemCount(item.type) : 0;
            this.slotElements[index].textContent = item ? `${item.type} (${count})` : '';
        });
    }
}

export class Item {
    constructor(type) {
        this.type = type;
    }
}