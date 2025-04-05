export class Inventory {
    constructor() {
        this.slots = new Array(5).fill(null);
        this.slotElements = Array.from(document.getElementsByClassName('inventory-slot'));
    }

    addItem(item) {
        const emptySlot = this.slots.findIndex(slot => slot === null);
        if (emptySlot !== -1) {
            this.slots[emptySlot] = item;
            this.updateUI();
            return true;
        }
        return false;
    }

    removeItem(itemType) {
        const itemSlot = this.slots.findIndex(slot => slot?.type === itemType);
        if (itemSlot !== -1) {
            this.slots[itemSlot] = null;
            this.updateUI();
            return true;
        }
        return false;
    }

    hasItems(items) {
        return items.every(itemType => 
            this.slots.some(slot => slot?.type === itemType)
        );
    }

    getItemCount(itemType) {
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