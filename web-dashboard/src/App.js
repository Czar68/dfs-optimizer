"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
const papaparse_1 = __importDefault(require("papaparse"));
require("./index.css");
function App() {
    const [cards, setCards] = (0, react_1.useState)([]);
    const [sportFilter, setSportFilter] = (0, react_1.useState)('All');
    (0, react_1.useEffect)(() => {
        const fetchCsv = () => {
            papaparse_1.default.parse('/data/underdog-cards.csv', {
                download: true,
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    const rows = (results.data || []).filter((row) => row && row.sport);
                    setCards(rows);
                },
            });
        };
        // Initial load
        fetchCsv();
        // Auto-refresh every 60s
        const intervalId = window.setInterval(fetchCsv, 60000);
        return () => window.clearInterval(intervalId);
    }, []);
    const filteredCards = cards
        .filter((c) => sportFilter === 'All' || c.sport === sportFilter)
        .sort((a, b) => b.kellyStake - a.kellyStake);
    return ((0, jsx_runtime_1.jsxs)("div", { className: "min-h-screen bg-gray-900 text-white p-8", children: [(0, jsx_runtime_1.jsx)("h1", { className: "text-4xl font-bold mb-8", children: "Props Kelly Dashboard" }), (0, jsx_runtime_1.jsxs)("select", { className: "mb-4 p-2 bg-gray-800 rounded", onChange: (e) => setSportFilter(e.target.value), value: sportFilter, children: [(0, jsx_runtime_1.jsx)("option", { children: "All" }), (0, jsx_runtime_1.jsx)("option", { children: "NBA" }), (0, jsx_runtime_1.jsx)("option", { children: "NCAAB" }), (0, jsx_runtime_1.jsx)("option", { children: "NHL" }), (0, jsx_runtime_1.jsx)("option", { children: "NFL" }), (0, jsx_runtime_1.jsx)("option", { children: "MLB" }), (0, jsx_runtime_1.jsx)("option", { children: "NCAAF" })] }), (0, jsx_runtime_1.jsx)("div", { className: "overflow-x-auto", children: (0, jsx_runtime_1.jsxs)("table", { className: "w-full border-collapse", children: [(0, jsx_runtime_1.jsx)("thead", { children: (0, jsx_runtime_1.jsxs)("tr", { className: "bg-gray-800", children: [(0, jsx_runtime_1.jsx)("th", { children: "Sport" }), (0, jsx_runtime_1.jsx)("th", { children: "EV%" }), (0, jsx_runtime_1.jsx)("th", { children: "Kelly $" }), (0, jsx_runtime_1.jsx)("th", { children: "Frac" }), (0, jsx_runtime_1.jsx)("th", { children: "Site" }), (0, jsx_runtime_1.jsx)("th", { children: "Legs" }), (0, jsx_runtime_1.jsx)("th", { children: "Edge%" })] }) }), (0, jsx_runtime_1.jsx)("tbody", { children: filteredCards.slice(0, 50).map((card, i) => ((0, jsx_runtime_1.jsxs)("tr", { className: "border-b border-gray-700 hover:bg-gray-800", children: [(0, jsx_runtime_1.jsx)("td", { children: card.sport }), (0, jsx_runtime_1.jsxs)("td", { className: "font-bold text-green-400", children: [(card.cardEv * 100).toFixed(1), "%"] }), (0, jsx_runtime_1.jsxs)("td", { className: "font-bold", children: ["$", card.kellyStake] }), (0, jsx_runtime_1.jsx)("td", { children: card.kellyFrac }), (0, jsx_runtime_1.jsx)("td", { children: card.site }), (0, jsx_runtime_1.jsx)("td", { children: [card.leg1Id, card.leg2Id, card.leg3Id]
                                            .filter(Boolean)
                                            .join('-') }), (0, jsx_runtime_1.jsxs)("td", { children: [(card.avgEdgePct * 100).toFixed(1), "%"] })] }, i))) })] }) }), (0, jsx_runtime_1.jsxs)("p", { className: "mt-8 text-sm opacity-75", children: ["Last update: ", new Date().toLocaleString(), " | Auto-refresh 60s"] })] }));
}
exports.default = App;
