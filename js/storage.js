const Storage = {
    DB_KEY: '@diarias_pro_data',

    // Busca todos os dados ou retorna um objeto vazio estruturado
    getData() {
        const data = localStorage.getItem(this.DB_KEY);
        return data ? JSON.parse(data) : { settings: {}, entries: {} };
    },

    // Salva uma nova entrada (dia trabalhado)
    saveEntry(date, entryData) {
        const data = this.getData();
        data.entries[date] = entryData;
        localStorage.setItem(this.DB_KEY, JSON.stringify(data));
    },

    // Busca configurações (salário base, metas)
    getSettings() {
        return this.getData().settings;
    }
};
