class InventoryManager {
  constructor() {
    this.hotbarSlots = Constants.HOTBAR_BLOCKS.map((id) => ({
      blockId: id,
      count: Infinity,
    }));
    this.selectedIndex = 0;
    this.onSelectCallback = null;
    this.inventory = {};
    this.renderHotbar();
  }

  renderHotbar() {
    const hotbarEl = document.getElementById("hotbar");
    hotbarEl.innerHTML = "";

    for (let i = 0; i < this.hotbarSlots.length; i++) {
      const slot = this.hotbarSlots[i];
      const data = Constants.BLOCK_DATA[slot.blockId];
      const el = document.createElement("div");
      el.className = "hotbar-slot" + (i === this.selectedIndex ? " active" : "");
      el.dataset.index = i;

      const icon = document.createElement("div");
      icon.className = "block-icon";
      icon.style.background = data.color || "#333";
      icon.style.border = "1px solid rgba(0,0,0,0.3)";
      el.appendChild(icon);

      const num = document.createElement("div");
      num.className = "slot-number";
      num.textContent = i + 1;
      el.appendChild(num);

      const name = document.createElement("div");
      name.style.cssText =
        "position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:0.55em;color:rgba(255,255,255,0.6);white-space:nowrap;";
      name.textContent = data.name;
      el.appendChild(name);

      el.addEventListener("click", () => {
        this.selectSlot(i);
      });

      hotbarEl.appendChild(el);
    }
  }

  selectSlot(index) {
    if (index < 0 || index >= this.hotbarSlots.length) return;
    this.selectedIndex = index;
    this.updateActiveSlot();
    if (this.onSelectCallback) this.onSelectCallback(index);
  }

  updateActiveSlot() {
    const slots = document.querySelectorAll(".hotbar-slot");
    slots.forEach((el, i) => {
      el.classList.toggle("active", i === this.selectedIndex);
    });
  }

  getSelectedBlock() {
    return this.hotbarSlots[this.selectedIndex].blockId;
  }

  addItem(blockId, count) {
    if (this.inventory[blockId]) {
      this.inventory[blockId] += count;
    } else {
      this.inventory[blockId] = count;
    }
  }

  canCraft(recipe) {
    return recipe.inputs.every((input) => {
      const count = this.inventory[input.id] || 0;
      return count >= input.count;
    });
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    recipe.inputs.forEach((input) => {
      this.inventory[input.id] -= input.count;
      if (this.inventory[input.id] <= 0) delete this.inventory[input.id];
    });
    this.addItem(recipe.output.id, recipe.output.count);
    return true;
  }

  getInventoryCount(blockId) {
    return this.inventory[blockId] || 0;
  }

  renderCraftingMenu() {
    const container = document.getElementById("crafting-recipes");
    container.innerHTML = "";

    Constants.CRAFTING_RECIPES.forEach((recipe) => {
      const outputData = Constants.BLOCK_DATA[recipe.output.id];
      const el = document.createElement("div");
      el.className = "recipe-slot";

      const canCraft = this.canCraft(recipe);

      const inputsText = recipe.inputs
        .map((inp) => {
          const d = Constants.BLOCK_DATA[inp.id];
          const have = this.inventory[inp.id] || 0;
          const color = have >= inp.count ? "#2ecc71" : "#e74c3c";
          return `<span style="color:${color}">${inp.count}x ${d.name}</span>`;
        })
        .join(" + ");

      el.innerHTML = `
        <div class="recipe-icon" style="background:${outputData.color};border:1px solid rgba(0,0,0,0.3);"></div>
        <div class="recipe-text">
          <strong style="color:${canCraft ? "#4ee4ec" : "#666"}">${recipe.output.count}x ${outputData.name}</strong><br/>
          <span style="font-size:0.85em">${inputsText}</span>
        </div>
      `;

      if (canCraft) {
        el.addEventListener("click", () => {
          this.craft(recipe);
          this.renderCraftingMenu();
        });
      } else {
        el.style.opacity = "0.5";
        el.style.cursor = "not-allowed";
      }

      container.appendChild(el);
    });
  }

  hasBlock(blockId) {
    return this.inventory[blockId] !== undefined && this.inventory[blockId] > 0;
  }

  consumeBlock(blockId) {
    if (this.inventory[blockId] === undefined || this.inventory[blockId] <= 0) return false;
    this.inventory[blockId]--;
    if (this.inventory[blockId] <= 0) delete this.inventory[blockId];
    return true;
  }
}
