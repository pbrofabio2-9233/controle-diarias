// Garante que o app só inicie quando tudo carregar
document.addEventListener('DOMContentLoaded', () => {
    if (typeof app !== 'undefined') {
        app.init();
    } else {
        console.error("Erro: O objeto 'app' não foi encontrado. Verifique a ordem dos scripts.");
    }
});
