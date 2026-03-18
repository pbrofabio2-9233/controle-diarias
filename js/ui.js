const UI = {
    modal: document.getElementById('modal-container'),

    openModal(content) {
        this.modal.innerHTML = `
            <div class="modal-content" onclick="event.stopPropagation()">
                <button class="btn-close-modal" onclick="UI.closeModal()">✕</button>
                ${content}
            </div>
        `;
        this.modal.classList.remove('hidden');
        
        // FIM DOS TOQUES FANTASMAS: Trava a rolagem do corpo da página
        document.body.style.overflow = 'hidden';
        
        // Fecha se clicar fora do modal (na área escura)
        this.modal.onclick = (e) => {
            if (e.target === this.modal) this.closeModal();
        };
    },

    closeModal() {
        this.modal.classList.add('hidden');
        this.modal.innerHTML = '';
        
        // Libera a rolagem do app novamente
        document.body.style.overflow = 'auto';
    }
};
