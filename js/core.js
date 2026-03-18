const app = {
    // Estado atual do aplicativo
    state: {
        currentView: 'calendar',
        data: {},
        visibleMonth: new Date().toISOString().slice(0, 7) // 'YYYY-MM'
    },

    // Inicialização do App
    init() {
        console.log("Sistema de Diárias Iniciado🚀");
        // 1. Carrega os dados salvos no banco de dados do navegador (localStorage)
        this.state.data = Storage.getData();
        
        // 2. NOVA FUNCIONALIDADE: Carrega e aplica o tema salvo nas configurações
        const settings = this.state.data.settings || {};
        this.applyTheme(settings.theme || 'light');

        // 3. Navega para a tela inicial
        this.navigate(this.state.currentView);
    },

    // Troca de Telas (SPA)
    navigate(view) {
        this.state.currentView = view;
        
        // Atualiza UI do menu
        document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`nav-${view}`);
        if (activeBtn) activeBtn.classList.add('active');

        // Renderiza a tela correspondente
        switch(view) {
            case 'calendar': Modules.calendar.render(); break;
            case 'list': Modules.list.render(); break;
            case 'dashboard': Modules.dashboard.render(); break;
            case 'settings': Modules.settings.render(); break;
            default: console.error("Tela não encontrada: ", view);
        }

        this.updateSummary();
    },

    // NOVA FUNÇÃO: Aplica a classe de tema no corpo da página
    applyTheme(theme) {
        document.body.className = ''; // Limpa temas antigos
        if (theme === 'dark') document.body.classList.add('theme-dark');
        if (theme === 'pink') document.body.classList.add('theme-pink');
    },

    // Calcula saldo mensal do mês que está na tela
    updateSummary() {
        const entries = this.state.data.entries || {};
        let totalProfit = 0;
        const monthToCalculate = this.state.visibleMonth; // Ex: '2026-03'

        Object.entries(entries).forEach(([dateKey, entry]) => {
            if (dateKey.startsWith(monthToCalculate)) {
                const profit = (entry.value || 0) - (entry.expenses || 0);
                totalProfit += profit;
            }
        });

        // Atualiza UI do cabeçalho
        const headerTotal = document.getElementById('total-profit');
        if (headerTotal) {
            headerTotal.innerText = totalProfit.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            // Atualiza o subtítulo para mostrar qual mês estamos visualizando
            const [year, month] = monthToCalculate.split('-');
            const monthName = new Date(year, month - 1, 1).toLocaleString('pt-br', {month: 'long'});
            document.querySelector('.summary-card small').innerText = `Saldo Líquido • ${monthName}`;
        }
    }
};
