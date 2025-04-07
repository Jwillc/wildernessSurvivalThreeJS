export class Inventory {
    constructor() {
        this.slots = new Array(5).fill(null);
        this.slotElements = Array.from(document.getElementsByClassName('inventory-slot'));
        this.unlimitedLogs = false; // Flag for unlimited logs cheat
        this.stackSizes = {
            'log': 999, // Logs can stack up to 999
            'rock': 999, // Rocks can stack up to 999
            'stick': 999, // Sticks can stack up to 999
            'axe': 1, // Axes don't stack
            'bow': 1, // Bows don't stack
            'arrow': 999, // Arrows can stack up to 999
            'string': 999 // String can stack up to 999
        };
    }

    addItem(item, count = 1) {
        // If item is a string, convert it to an Item object
        const itemType = typeof item === 'string' ? item : item.type;
        const itemQuantity = typeof item === 'string' ? count : (item.quantity || count);
        const maxStack = this.stackSizes[itemType] || 1;

        console.log(`Adding ${itemQuantity} ${itemType}(s) to inventory`);

        // If the item can stack, try to add to existing stacks first
        if (maxStack > 1) {
            // Find slots with the same item type that aren't full
            const existingSlots = this.slots
                .map((slot, index) => ({ slot, index }))
                .filter(({ slot }) => slot !== null && slot.type === itemType && slot.quantity < maxStack);

            let remainingCount = itemQuantity;

            // Add to existing stacks first
            for (const { slot, index } of existingSlots) {
                const spaceInSlot = maxStack - slot.quantity;
                const amountToAdd = Math.min(spaceInSlot, remainingCount);

                if (amountToAdd > 0) {
                    slot.quantity += amountToAdd;
                    remainingCount -= amountToAdd;
                    console.log(`Added ${amountToAdd} to existing stack in slot ${index}, remaining: ${remainingCount}`);

                    if (remainingCount <= 0) {
                        break;
                    }
                }
            }

            // If we've added all items, update UI and return
            if (remainingCount <= 0) {
                this.updateUI();
                return true;
            }

            // If we still have items to add, create new stacks in empty slots
            while (remainingCount > 0) {
                const emptySlot = this.slots.findIndex(slot => slot === null);
                if (emptySlot !== -1) {
                    const amountToAdd = Math.min(maxStack, remainingCount);
                    this.slots[emptySlot] = new Item(itemType, amountToAdd);
                    remainingCount -= amountToAdd;
                    console.log(`Created new stack with ${amountToAdd} in slot ${emptySlot}, remaining: ${remainingCount}`);
                } else {
                    // No more empty slots
                    console.log(`No more empty slots, couldn't add remaining ${remainingCount} items`);
                    this.updateUI();
                    return itemQuantity > remainingCount; // Return true if we added at least some items
                }
            }

            this.updateUI();
            return true;
        } else {
            // For non-stacking items, use the original logic
            let added = 0;

            for (let i = 0; i < itemQuantity; i++) {
                const emptySlot = this.slots.findIndex(slot => slot === null);
                if (emptySlot !== -1) {
                    this.slots[emptySlot] = new Item(itemType, 1);
                    added++;
                    console.log(`Added non-stacking item to slot ${emptySlot}, ${added}/${itemQuantity}`);
                } else {
                    console.log(`No more empty slots for non-stacking items, added ${added}/${itemQuantity}`);
                    break; // No more empty slots
                }
            }

            this.updateUI();
            return added > 0;
        }
    }

    removeItem(itemType, count = 1) {
        // If unlimited logs is enabled and we're removing logs, pretend it worked
        if (this.unlimitedLogs && itemType === 'log') {
            return true;
        }

        const itemSlot = this.slots.findIndex(slot => slot?.type === itemType);
        if (itemSlot !== -1) {
            // If the item has a quantity greater than 1, just reduce the quantity
            if (this.slots[itemSlot].quantity > count) {
                this.slots[itemSlot].quantity -= count;
            } else {
                // Otherwise remove the item completely
                this.slots[itemSlot] = null;
            }
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

        // Sum up the quantities of all matching items
        const count = this.slots
            .filter(slot => slot?.type === itemType)
            .reduce((total, slot) => {
                console.log(`Slot with ${itemType} has quantity: ${slot.quantity}`);
                return total + slot.quantity;
            }, 0);

        console.log(`Total count of ${itemType}: ${count}`);
        return count;
    }

    updateUI() {
        console.log('Updating inventory UI');
        this.slots.forEach((item, index) => {
            if (item) {
                // For stacked items, show the quantity in the slot
                this.slotElements[index].textContent = `${item.type} (${item.quantity})`;
                console.log(`Slot ${index}: ${item.type} (${item.quantity})`);
            } else {
                this.slotElements[index].textContent = '';
                console.log(`Slot ${index}: empty`);
            }
        });

        // Log total counts of important resources
        console.log(`Total logs: ${this.getItemCount('log')}`);
        console.log(`Total rocks: ${this.getItemCount('rock')}`);
    }
}

export class Item {
    constructor(type, quantity = 1) {
        this.type = type;
        this.quantity = quantity;
        console.log(`Created new Item: ${type} with quantity ${quantity}`);
    }
}