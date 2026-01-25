// =========================================
    // 1. DATA & HELPERS
    // =========================================
    
    const MOCK_DATA = {
        user: { name: "Demo Manager", summary_overall_points: 950, summary_event_points: 45, summary_overall_rank: 125000 },
        bank: 5, value: 1024,
        picks: [
            { element: 1, position: 1, multiplier: 1 }, { element: 2, position: 2, multiplier: 1 }, { element: 3, position: 3, multiplier: 1 }, { element: 4, position: 4, multiplier: 1 }, 
            { element: 5, position: 5, is_vice_captain: true, multiplier: 1 }, { element: 6, position: 6, multiplier: 1 }, { element: 7, position: 7, multiplier: 1 }, { element: 8, position: 8, multiplier: 1 }, 
            { element: 9, position: 9, is_captain: true, multiplier: 2 }, { element: 10, position: 10, multiplier: 1 }, { element: 11, position: 11, multiplier: 1 }, { element: 12, position: 12, multiplier: 1 }, 
            { element: 13, position: 13, multiplier: 1 }, { element: 14, position: 14, multiplier: 1 }, { element: 15, position: 15, multiplier: 1 }
        ],
        players: {
            9: { web_name: "Haaland", team_code: 43, pos: 4, price: 14.0, event_points: 13, status: 'd', chance: 75, news: "Knock", sel: 70, form: 8.5, transfers_in: 50000, total_points: 150, ict_index: 300 },
            5: { web_name: "Salah", team_code: 14, pos: 3, price: 13.0, event_points: 12, status: 'a', chance: 100, news: "", sel: 40, form: 7.0, transfers_in: 30000, total_points: 140, ict_index: 280 },
            1: { web_name: "Pickford", team_code: 11, pos: 1, price: 4.5, event_points: 6, status: 'a', form: 3.5, transfers_in: 1000, total_points: 50, ict_index: 20 }
        },
        fixtures: { 9: { opp: "LIV", diff: 5, is_home: true } }
    };

    // --- GOD MODE TRANSFER BOT (STABLE HARD-CODED) ---
    const TransferBot = {
        preCalcTeamData: (fixMap) => {
            const data = {};
            for (const [tid, fixList] of Object.entries(fixMap)) {
                let sum = 0;
                // Shift: Use index 1 and 2 (Next Upcoming GWs)
                const limit = Math.min(fixList.length, 3); 
                for (let i = 1; i < limit; i++) sum += (fixList[i]?.diff || 3);
                data[tid] = { avg: limit > 1 ? sum / (limit - 1) : 3, nextHome: fixList[1] ? fixList[1].is_home : false };
            }
            return data;
        },

        getScore: (p, teamData) => {
            const t = teamData[p.team_id] || { avg: 3, nextHome: false };
            const form = parseFloat(p.form) || 0;
            const ict = parseFloat(p.ict_index) || 0;
            
            // Refined Logic: Split Defenders vs Attackers
            let score = 0;
            if (p.pos <= 2) {
                // DEF/GK: Prioritize Fixtures (Clean Sheets) over Form
                score = (form * 2) + (ict * 0.1) + (30 - (t.avg * 6));
            } else {
                // MID/FWD: Prioritize Form & Threat over Fixtures
                score = (form * 6) + (ict * 0.2) + (15 - (t.avg * 2));
            }

            if (p.status !== 'a' && p.chance < 75) score -= 200;
            if (p.pos === 1) score *= 0.85; 
            if (t.nextHome) score += 2; 

            return score;
        },

        recommendFormation: (myPicks, allPlayers, fixtures) => {
            const teamStats = TransferBot.preCalcTeamData(fixtures);
            const rated = myPicks.map(pick => {
                const p = allPlayers[pick.element];
                return { p, score: TransferBot.getScore(p, teamStats) };
            });
            const gk = rated.filter(x => x.p.pos === 1).sort((a,b) => b.score - a.score)[0];
            const outfield = rated.filter(x => x.p.pos !== 1);
            
            const formations = [[3,4,3], [3,5,2], [4,3,3], [4,4,2], [4,5,1], [5,3,2], [5,4,1], [5,2,3]];
            let bestForm = null, maxScore = -9999, bestLineup = [];

            formations.forEach(f => {
                const defs = outfield.filter(x => x.p.pos === 2).sort((a,b) => b.score - a.score).slice(0, f[0]);
                const mids = outfield.filter(x => x.p.pos === 3).sort((a,b) => b.score - a.score).slice(0, f[1]);
                const fwds = outfield.filter(x => x.p.pos === 4).sort((a,b) => b.score - a.score).slice(0, f[2]);
                if (defs.length === f[0] && mids.length === f[1] && fwds.length === f[2]) {
                    const total = gk.score + [...defs, ...mids, ...fwds].reduce((a,b) => a + b.score, 0);
                    if (total > maxScore) { maxScore = total; bestForm = f.join('-'); bestLineup = [gk.p.id, ...defs.map(x=>x.p.id), ...mids.map(x=>x.p.id), ...fwds.map(x=>x.p.id)]; }
                }
            });

            // PRO BENCH: 1st Sub must be "Safe" (Reliable Mins). Others are high upside.
            const benchRaw = rated.filter(x => !bestLineup.includes(x.p.id));
            const safeSub = benchRaw.find(x => x.p.pos !== 1 && x.p.minutes > 60 && x.p.chance === 100);

            const bench = benchRaw.sort((a,b) => {
                if (a.p.pos === 1) return -1; // GK last
                if (b.p.pos === 1) return 1;
                // Force safe sub to top of outfield bench
                if (safeSub) {
                   if (a.p.id === safeSub.p.id) return -1;
                   if (b.p.id === safeSub.p.id) return 1;
                }
                return b.score - a.score;
            });

            // CAPTAINCY: Best score in Starting XI
            const starters = rated.filter(x => bestLineup.includes(x.p.id)).sort((a,b) => b.score - a.score);
            return { formation: bestForm, bench: bench.map(x => x.p), bestLineup, captain: starters[0].p.id, vice: starters[1].p.id };
        },

        analyze: (myPicks, allPlayers, bank, fixtures, ftCount) => {
            let singleMoves = [];
            let finalSuggestions = [];

            // A. Prepare Data
            const teamStats = TransferBot.preCalcTeamData(fixtures);

            // B. Score Squad
            const squadScores = myPicks.map(pick => {
                const p = allPlayers[pick.element];
                if (!p) return null; // Allow GK
                return { p: p, score: TransferBot.getScore(p, teamStats) };
            }).filter(x => x).sort((a,b) => a.score - b.score);

            // C. Score Market (Top 200 to ensure coverage across all positions)
            const marketScores = Object.values(allPlayers)
                .filter(p => p.status === 'a' && parseFloat(p.form) > 0.5) 
                .map(p => ({ p: p, score: TransferBot.getScore(p, teamStats) }))
                .sort((a,b) => b.score - a.score)
                .slice(0, 200);

            // --- CHAIN BUILDER (1 to 5 Moves) ---
            const buildChain = () => {
                let curPicks = [...myPicks];
                let curBank = bank;
                let usedOut = new Set();
                let usedIn = new Set();
                let pathOut = [];
                let pathIn = [];
                let rawDiff = 0;
                const labels = ["Single", "Double", "Triple", "Quad", "Quint"];

                // Limit chain depth: suggest moves up to FT count + 1 (allow 1 hit)
                const maxSteps = Math.min(5, ftCount + 1);

                for (let step = 0; step < maxSteps; step++) {
                    let bestLink = null;
                    // Find removable players (not already in chain)
                    const candidates = squadScores.filter(x => !usedOut.has(x.p.id));
                    
                    // Look for best single swap to extend chain
                    for (let i = 0; i < Math.min(8, candidates.length); i++) {
                        const sell = candidates[i];
                        
                        // FIX: Conservative Sell Price (Account for 50% Profit Tax)
                        const pick = myPicks.find(p => p.element === sell.p.id);
                        let sellPrice = sell.p.price;
                        
                        // FIX: Calculate Dynamic Selling Price (Purchase Price vs Fresh Current Price)
                        // Use the exact selling price we calculated during app.load
                        // Note: Public API does NOT provide selling_price, so we rely entirely on our app.load calculation
                        if (pick && typeof pick.selling_price === 'number') {
                            sellPrice = pick.selling_price / 10;
                        }

                        // FIX: Strict Integer Math (x10) to prevent floating point drift (e.g. 0.1 + 0.2 != 0.3)
                        const budgetInt = Math.round((curBank + sellPrice) * 10);
                        
                        for (const buyObj of marketScores) {
                            if (buyObj.p.pos !== sell.p.pos) continue;
                            
                            // Check Price using Integers (Exact Match)
                            if (Math.round(buyObj.p.price * 10) > budgetInt) continue;

                            if (curPicks.some(p => p.element === buyObj.p.id) || usedIn.has(buyObj.p.id)) continue;
                            
                            // Check Max 3 Players Per Team Rule
                            const tId = buyObj.p.team_id;
                            const countExisting = curPicks.filter(p => allPlayers[p.element].team_id === tId && !usedOut.has(p.element) && p.element !== sell.p.id).length;
                            const countAdded = [...usedIn].filter(id => allPlayers[id].team_id === tId).length;
                            if ((countExisting + countAdded) >= 3) continue;

                            const gain = buyObj.score - sell.score;
                            // Update best link for this step if gain is higher
                            if (gain > 0.1 && (!bestLink || gain > bestLink.gain)) {
                                bestLink = { sell: sell.p, buy: buyObj.p, gain, sellPrice };
                            }
                        }
                    }

                    if (bestLink) {
                        usedOut.add(bestLink.sell.id);
                        usedIn.add(bestLink.buy.id);
                        pathOut.push(bestLink.sell);
                        pathIn.push(bestLink.buy);
                        curBank = curBank + bestLink.sellPrice - bestLink.buy.price;
                        rawDiff += bestLink.gain;
                        
                        // Calculate cost
                        const hitCost = Math.max(0, (step + 1) - ftCount) * 4;
                        const netDiff = parseFloat((rawDiff - hitCost).toFixed(1));

                        // Push this stage of the chain
                        if (netDiff > 0.5) {
                            finalSuggestions.push({
                                type: `${labels[step]} Move${hitCost > 0 ? ` (-${hitCost})` : ''}`, 
                                out: [...pathOut],
                                in: [...pathIn],
                                diff: netDiff
                            });
                        }
                    } else {
                        break; // Stop if we can't improve further
                    }
                }
            };
            buildChain();

            // 4. Sort & Roll
            finalSuggestions.sort((a, b) => b.diff - a.diff);
            const bestDiff = finalSuggestions.length > 0 ? finalSuggestions[0].diff : 0;
            if (ftCount < 5 && bestDiff < 8.0) {
                finalSuggestions.unshift({ type: 'Roll Transfer', out: [], in: [], diff: 0.0 });
            }

            return finalSuggestions.slice(0, 5);
        },

        // FIX: Analyze the user-selected strategy (targetMove) instead of loop
        recommendChips: (picks, fixMap, currentGW, history, targetMove) => {
            const used = history.chips.map(c => c.name);
            const next5 = [0,1,2,3,4].map(i => currentGW + i);
            let rec = null;

            // 0. LINK: React to Selected Transfer Scenario
            if (targetMove) {
                // A. Wildcard: If selected move is a massive hit-taking overhaul
                if ((targetMove.type.includes('(-8)') || targetMove.type.includes('(-12)') || targetMove.type.includes('(-16)')) && targetMove.diff > 12) {
                    if (!used.includes('wildcard')) {
                        rec = { chip: 'Wildcard', gw: next5[0], reason: `Selected strategy gains +${targetMove.diff} pts but costs hits. Active Wildcard recommended.` };
                    }
                }
                
                // B. Triple Captain: If selected move brings in a superstar
                if (!rec) {
                    const star = targetMove.in.find(p => p.price > 11.0);
                    if (star && !used.includes('3xc')) {
                        const f = (fixMap[star.team_id]||[])[0]; // Next GW
                        if (f && f.diff <= 2) rec = { chip: 'Triple Captain', gw: next5[0], reason: `Strategy adds ${star.web_name} vs ${f.opp}. Perfect Triple Captain entry.` };
                    }
                }
            }

            // 1. Wildcard (Long-term Crisis Check)
            if (!used.includes('wildcard')) {
                let badCount = 0;
                picks.forEach(p => {
                    const f = fixMap[p.element] || [];
                    // Avg diff of next 3 games > 3.5 implies tough run
                    const avg = (f.slice(0,3).reduce((a,b)=>a+(b.diff||3),0))/3;
                    if (avg > 3.5) badCount++;
                });
                if (badCount >= 5) rec = { chip: 'Wildcard', gw: next5[0], reason: "Detected severe fixture turn for 5+ players." };
            }

            // 2. Free Hit (Short-term Crisis Check)
            if (!used.includes('freehit') && !rec) {
                const starters = picks.filter(p => p.position <= 11);
                const totalDiff = starters.reduce((acc, p) => acc + ((fixMap[p.element]||[])[0]?.diff || 3), 0);
                // Avg difficulty > 4.0 implies crisis week
                if ((totalDiff / 11) > 4.0) rec = { chip: 'Free Hit', gw: next5[0], reason: "Extreme fixture difficulty detected for this week only." };
            }

            // 3. Triple Captain
            if (!used.includes('3xc') && !rec) {
                next5.forEach(gw => {
                    picks.forEach(p => {
                        if ((p.element === 9 || p.element === 5) && p.multiplier > 0) {
                            const f = (fixMap[p.element] || [])[gw - currentGW];
                            if (f && f.diff < 2) rec = { chip: 'Triple Captain', gw: gw, reason: `${p.element === 9 ? 'Haaland' : 'Salah'} has an easy fixture (Diff 1).` };
                        }
                    });
                });
            }
            
            // 4. Bench Boost
            if (!used.includes('bboost') && !rec) {
                const bench = picks.filter(p => p.position > 11);
                const isEasy = bench.every(p => {
                    const f = (fixMap[p.element] || [])[0];
                    return f && f.diff <= 3;
                });
                if (isEasy) rec = { chip: 'Bench Boost', gw: next5[0], reason: "All 4 bench players have favorable fixtures." };
            }

            // 5. Default (Save)
            if (!rec) {
                rec = { chip: 'Save Chips', gw: next5[0], reason: "Team looks solid. Hold chips for Double Gameweeks." };
            }

            return rec;
        },

        analyzeCaptaincy: (picks, players, fixMap, fixIdx = 0) => {
            let cur = null, curVice = null;
            const ranked = [];
            picks.forEach(p => {
                if (p.position > 11) return;
                const pl = players[p.element];
                if (!pl) return;
                // Score: Form + (5 - FixtureDiff)*2 + HomeAdvantage
                const f = (fixMap[pl.team_id]||[])[fixIdx] || {diff:3, is_home:false};
                
                // FIX: Apply Injury Chance Multiplier to avoid recommending injured players
                let chance = (pl.chance !== null ? pl.chance : 100) / 100;
                let score = (parseFloat(pl.form) + ((5 - f.diff) * 2.5) + (f.is_home ? 1 : 0)) * chance;
                
                if (p.is_captain) cur = { name: pl.name, score };
                if (p.is_vice_captain) curVice = { name: pl.name, score };
                
                ranked.push({ name: pl.name, score });
            });
            ranked.sort((a, b) => b.score - a.score);
            return (cur && ranked.length > 0) ? { best: ranked[0], vice: ranked[1] || null, cur, curVice } : null;
        }
    };

    const MarketBot = {
        getTrends: (allPlayers) => {
            const players = Object.values(allPlayers);
            const movers = [...players].sort((a, b) => b.transfers_in - a.transfers_in).slice(0, 5);
            return { movers };
        }
    };

    // =========================================
    // 2. MAIN APPLICATION
    // =========================================

    const app = {
        plannerSelIndex: 0, // State for selected strategy
        userData: null, playersCache: {}, fixMap: {}, currentPicks: [], currentBank: 0,
        teams: null, currentTool: 'squad', historyData: null, deadline: null, gwName: '',
        
        clearSearch: () => {
            const el = document.getElementById('scoutInput');
            el.value = '';
            app.searchScout('');
            el.focus();
        },
        
        updateBank: () => {
            const current = (app.currentBank).toFixed(1);
            const newVal = prompt("Sync Bank Balance:\nEnter your exact bank from the Official FPL site (e.g. 1.5):", current);
            if (newVal !== null && !isNaN(parseFloat(newVal))) {
                app.currentBank = parseFloat(newVal);
                app.switchTool('transfers', true); // Refresh view
            }
        },
        currentStats: null, isSimulating: false, simNewIds: [], timer: null, statusMap: {},
        viewMode: 'live', ftCount: 1, lastEvents: {}, liveInterval: null, bonusMap: {},
        deadlineNotified: false, dayNotified: false, fixtureCache: {}, suggestionCache: null, searchTimer: null,

        init: () => {
            // FIX: Request Permission on first click (Browser Security Requirement)
            const enableNotif = () => {
                if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
                document.removeEventListener('click', enableNotif);
            };
            document.addEventListener('click', enableNotif);

            const savedId = localStorage.getItem('fpl_id_final');
            const lastTool = localStorage.getItem('fpl_last_tool');
            if (lastTool) app.currentTool = lastTool;
            if (savedId) {
                document.getElementById('teamID').value = savedId;
                app.load(savedId);
            }
            // Fix: Initialize Browser History State
            history.replaceState({ tool: app.currentTool }, '', '');
        },

        testNotification: () => {
            if (!('Notification' in window)) return alert("Not supported.");
            
            // FIX: If not granted, explicitly ask for permission now (User Gesture)
            if (Notification.permission === 'granted') {
                new Notification("🔔 Success!", { body: "Notifications are working correctly." });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification("🔔 Success!", { body: "Notifications enabled!" });
                    }
                });
            } else {
                alert("Notifications are blocked. Please enable them in your browser settings.");
            }
        },

        fetchUrl: async (targetUrl) => {
            const proxies = [
                (url) => `https://fpl-universal.harithdanish0309.workers.dev/?url=${encodeURIComponent(url)}`,
                (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`, 
                (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
                (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
                (url) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`
            ];
            
            // Parallel Fetch: Race to the first successful result
            const requests = proxies.map(p => {
                return (async () => {
                    const c = new AbortController(); 
                    const id = setTimeout(() => c.abort(), 6000); 
                    try {
                        const r = await fetch(p(targetUrl), { signal: c.signal }); 
                        clearTimeout(id);
                        if (!r.ok) throw new Error('Status ' + r.status);
                        return await r.json();
                    } catch (e) { 
                        clearTimeout(id); 
                        throw e; 
                    }
                })();
            });

            try {
                return await Promise.any(requests);
            } catch (e) {
                throw new Error("Failed");
            }
        },

        calcFreeTransfers: () => {
            if (!app.historyData || !app.historyData.current) return 1;
            let saved = 0;
            app.historyData.current.forEach(gw => {
                let available = 1 + saved;
                if (available > 5) available = 5;
                const used = gw.event_transfers;
                saved = available - used;
                if (saved < 0) saved = 0;
            });
            let current = saved + 1;
            if (current > 5) current = 5;
            return current;
        },

        show: (viewId) => {
            document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
            ['welcomeView', 'loadingView', 'dashboardView', 'transfersView', 'plannerView'].forEach(v => document.getElementById(v).classList.add('hidden'));
            document.getElementById(viewId).classList.remove('hidden');
        },

        toggleMenu: () => {
            document.getElementById('sideMenu').classList.toggle('open');
            document.getElementById('menuOverlay').classList.toggle('open');
        },

        switchTool: (t, suppressMenu = false, fromHistory = false) => {
            if (!fromHistory) history.pushState({ tool: t }, '', ''); // Push new state
            if (!suppressMenu) app.toggleMenu();
            
            app.currentTool = t;
            localStorage.setItem('fpl_last_tool', t);
            
            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            document.getElementById('nav-' + t).classList.add('active');

            if (t === 'squad') {
                app.isSimulating = false;
                app.simNewIds = [];
                const banner = document.querySelector('.sim-banner');
                if (banner) banner.remove();
                if (Object.keys(app.playersCache).length > 0) app.render(app.userData, app.currentPicks, app.playersCache, app.fixMap, app.statusMap, app.currentStats, app.historyData, app.deadline, app.gwName);
                else app.load(localStorage.getItem('fpl_id_final'));

            } else if (t === 'planner') {
                app.plannerSelIndex = 0; // Reset to best move on open
                app.show('plannerView');
                app.renderPlanner();

            } else {
                // --- FIXED AUTO-RELOAD LOGIC ---
                app.show('transfersView');
                
                // Clear UI to force a visual "Reload" effect
                document.querySelector('.search-input').value = '';
                document.getElementById('scoutResults').style.display = 'none';
                // ... (rest of transfer logic remains below) ...
                document.getElementById('transferContent').style.display = 'block';

                app.ftCount = app.calcFreeTransfers();

                // Memoization: Check Cache
                const sig = app.currentPicks.map(p => p.element).join('-') + '|' + app.currentBank + '|' + app.ftCount;
                if (app.suggestionCache && app.suggestionCache.sig === sig) {
                    document.getElementById('transferContent').innerHTML = app.suggestionCache.html;
                    return;
                }

                const bankTxt = app.currentStats ? (app.currentStats.bank/10).toFixed(1) : '0.0';
                
                // Show Skeleton Loader (Perceived Performance)
                const headerHtml = `
                    <div style="display:flex; justify-content:space-between; padding:15px; background:white; border-bottom:1px solid var(--border); margin:-15px -15px 15px -15px;">
                        <div style="font-size:0.85rem; font-weight:700; color:var(--text-sub);">Bank: <span style="color:var(--primary); cursor:pointer; border-bottom:1px dashed var(--primary);" onclick="app.updateBank()" title="Click to fix budget">£${bankTxt}m <i class="fa-solid fa-pen" style="font-size:0.7rem;"></i></span></div>
                        <div style="font-size:0.85rem; font-weight:700; color:var(--text-sub);">Free Transfers: <span style="color:${app.ftCount === 5 ? 'var(--primary)' : '#00ff85'}; font-weight:800;">${app.ftCount}</span></div>
                    </div>
                    <div style="padding:0 10px;">
                        <div class="t-card skeleton" style="height:140px; margin-bottom:20px; border-radius:24px;"></div>
                        <div class="t-card skeleton" style="height:140px; margin-bottom:20px; border-radius:24px;"></div>
                    </div>
                `;
                
                const container = document.getElementById('transferContent');
                container.innerHTML = headerHtml;

                // WRAPPED IN TRY/CATCH TO PREVENT INFINITE SPINNER
                setTimeout(() => {
                    try {
                        // Safety Check: Do we have data?
                        if (!app.currentPicks || app.currentPicks.length === 0 || Object.keys(app.playersCache).length === 0) {
                             throw new Error("No data loaded");
                        }

                        const suggestions = TransferBot.analyze(app.currentPicks, app.playersCache, app.currentBank, app.fixMap, app.ftCount);
                        // Removed Optimal Lineup Calculation
                        const market = MarketBot.getTrends(app.playersCache);
                        
                        let html = `
                        <div style="display:flex; justify-content:space-between; padding:10px 15px; background:white; border-radius:12px; border:1px solid var(--border); margin-bottom:20px;">
                            <div style="font-size:0.85rem; font-weight:700; color:var(--text-sub);">Bank: <span style="color:var(--primary);">£${bankTxt}m</span></div>
                            <div style="font-size:0.85rem; font-weight:700; color:var(--text-sub);">Free Transfers: <span style="color:${app.ftCount === 5 ? '#e90052' : '#00ff85'}; font-weight:800;">${app.ftCount}</span></div>
                        </div>`;

                        if (suggestions.length > 0) {
                            suggestions.forEach((s, index) => {
                                const isBest = index === 0;
                                const cardClass = isBest ? 't-card best-pick' : 't-card';
                                const badge = isBest ? '<div class="rec-badge"><i class="fa-solid fa-star"></i> AI RECOMMENDED</div>' : '';
                                
                                if (index === 0) html += `<div style="font-size:1.1rem; font-weight:800; margin-bottom:10px; padding-left:5px;">Strategy</div>`;
                                else if (index === 1) html += `<div style="font-size:0.9rem; font-weight:700; color:#888; margin:20px 0 10px 0; padding-left:5px;">Alternative Options</div>`;

                                if (s.type === 'Roll Transfer') {
                                    html += `<div class="${cardClass}" style="padding:25px; text-align:center;">${badge}<div style="font-size:2rem; margin:10px 0; color:#059669;"><i class="fa-solid fa-shield-halved"></i></div><div style="font-weight:800; margin-bottom:5px; font-size:1.1rem;">Save Free Transfer</div><div style="font-size:0.85rem; color:#666; line-height:1.4;">Your team is strong. You have ${app.ftCount} FTs. Saving one gives you flexibility next week.</div></div>`;
                                    return;
                                }
                               
                                const outIds = JSON.stringify(s.out.map(p => p.id));
                                const inIds = JSON.stringify(s.in.map(p => p.id));
                                
                                // Bank Calc
                                const bankRem = (app.currentBank + s.out.reduce((a,b)=> {
                                    const p = app.currentPicks.find(px => px.element === b.id);
                                    return a + (p && p.selling_price ? p.selling_price/10 : b.price);
                                },0) - s.in.reduce((a,b)=>a+b.price,0)).toFixed(1);
                                
                                let verdict = '';
                                if (s.type.includes('(-') && s.diff > 6) verdict = '<span style="font-size:0.65rem; font-weight:800; color:#16a34a; background:#dcfce7; padding:2px 6px; border-radius:4px; margin-left:4px;"><i class="fa-regular fa-gem"></i> Worth Hit</span>';
                                else if (!s.type.includes('(-') && app.ftCount > 1) verdict = '<span style="font-size:0.65rem; font-weight:800; color:#2563eb; background:#dbeafe; padding:2px 6px; border-radius:4px; margin-left:4px;"><i class="fa-solid fa-star"></i> Use FT</span>';

                                // Render Rows Helper
                                const renderRow = (list, label, labelClass) => {
                                    let str = `<div class="t-half ${labelClass === 'lbl-out' ? 't-out' : 't-in'}"><div class="t-label ${labelClass}" style="align-self:start; margin-bottom:0;">${label}</div>`;
                                    list.forEach(p => {
                                        const fixtures = app.fixMap[p.team_id] || [];
                                        let dots = '<div class="t-fdr">';
                                        fixtures.slice(1, 4).forEach(f => { if(f) dots += `<div class="t-dot bg-${f.diff}">${f.opp}</div>` });
                                        dots += '</div>';
                                        
                                        const net = (p.transfers_in || 0) - (p.transfers_out || 0);
                                        const netStr = (Math.abs(net) > 999) ? (net/1000).toFixed(1) + 'k' : net;
                                        const warn = p.status === 'd' ? '<i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24; margin-left:4px; font-size:0.75rem;"></i>' : (['i','s','n'].includes(p.status) ? '<i class="fa-solid fa-circle-exclamation" style="color:#ef4444; margin-left:4px; font-size:0.75rem;"></i>' : '');

                                        str += `
                                        <div class="t-player-row" onclick="app.openModal(${p.id})">
                                            <img src="https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}-66.png" style="width:40px; height:50px; object-fit:contain;">
                                            <div class="t-info-box">
                                                <div style="font-weight:800; font-size:0.95rem; color:#111;">${p.name}${warn}</div>
                                                <div style="font-size:0.75rem; color:#6b7280; font-weight:600;">${p.team} • <span style="${net>=0?'color:#16a34a':'color:#ef4444'}">${net>=0?'+':''}${netStr} Net</span></div>
                                            </div>
                                            <div class="t-stat-box">
                                                <div style="font-weight:800; font-size:0.9rem;">£${p.price}m</div>
                                                ${dots}
                                            </div>
                                        </div>`;
                                    });
                                    return str + '</div>';
                                };

                                html += `<div class="${cardClass}"><div class="t-header" style="align-items:center;"><div>${badge}<div style="display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-bottom:4px;"><div class="t-type">${s.type}</div>${verdict}</div><div class="t-bank-tag">Bank: £${bankRem}m</div></div><div class="t-gain">+${s.diff}</div></div>
                                <div class="t-body">
                                    ${renderRow(s.out, 'SELL', 'lbl-out')}
                                    ${renderRow(s.in, 'BUY', 'lbl-in')}
                                </div>
                                <div style="padding:15px;"><button class="preview-btn" onclick='app.simulate(${outIds}, ${inIds})'><i class="fa-solid fa-eye"></i> Preview Team</button></div></div>`;
                            });
                        } else {
                            html += `<div class="welcome-card"><p>Team is optimal. Save your transfer.</p></div>`;
                        }

                        html += `<div style="font-size:1.1rem; font-weight:800; margin:30px 0 15px 0; padding-left:5px;">Market Trends</div><div class="trend-scroll">`;
                        market.movers.forEach(p => {
                            // Add Fixture Dots (Next 3 Games)
                            const fixtures = app.fixMap[p.team_id] || [];
                            let dots = '<div class="t-fdr" style="justify-content:center; margin-top:6px;">';
                            fixtures.slice(1,4).forEach(f => { if(f) dots+=`<div class="t-dot bg-${f.diff}">${f.opp}</div>` });
                            dots += '</div>';

                            html += `<div class="trend-card" onclick="app.openModal(${p.id})"><img src="https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}-66.png" class="trend-img"><div class="trend-name">${p.name}</div><div class="trend-team">${p.team}</div><div class="trend-stat"><i class="fa-solid fa-arrow-trend-up"></i> Hot</div>${dots}</div>`;
                        });
                        html += `</div><div style="height:40px;"></div>`;
                        
                        app.suggestionCache = { sig, html };
                        container.innerHTML = html;
                    } catch (err) {
                        console.error("Transfer Error", err);
                        container.innerHTML = `<div class="welcome-card" style="color:#ef4444;"><p>Analysis unavailable. Check connection.</p><button class="btn" style="margin-top:10px" onclick="app.load()">Reload Data</button></div>`;
                    }
                }, 100); 
            }
        },

        filterByTeam: (teamName) => {
            document.querySelector('.search-input').value = teamName;
            app.searchScout(teamName);
            document.querySelector('.search-container').scrollIntoView({ behavior: 'smooth' });
        },

        // --- NEW: Filter Players by Position ---
        // --- NEW: Filter Players by Position (With Toggle Logic) ---
        filterPos: (posId, btnElement) => {
            // 1. TOGGLE OFF: If clicking the active button again, reset to main view
            if (btnElement.classList.contains('active')) {
                btnElement.classList.remove('active');
                document.getElementById('scoutResults').style.display = 'none';
                document.getElementById('transferContent').style.display = 'block';
                return;
            }

            // 2. TOGGLE ON: Activate button and show list
            document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
            btnElement.classList.add('active');

            document.getElementById('transferContent').style.display = 'none';
            const res = document.getElementById('scoutResults');
            res.style.display = 'block';

            // 3. Filter & Sort Data (By Form)
            const players = Object.values(app.playersCache);
            // Relaxed Filter: Allow Available ('a') AND Doubtful ('d')
            const matches = players.filter(p => p.pos == posId && (p.status === 'a' || p.status === 'd'));
            matches.sort((a,b) => parseFloat(b.form) - parseFloat(a.form)); 
            const top20 = matches.slice(0, 20);

            // 4. Render List
            let html = '';
            if (top20.length === 0) {
                html = '<div style="text-align:center; padding:20px; color:#888">No players found.</div>';
            } else {
                top20.forEach(p => {
                    const fixtures = app.fixMap[p.team_id] || [];
                    let dots = '<div class="t-fdr" style="margin-top:4px;">';
                    // Shift to 1,4 to show next upcoming games
                    fixtures.slice(1,4).forEach(f => { if(f) dots+=`<div class="t-dot bg-${f.diff}">${f.opp}</div>` });
                    dots += '</div>';
                    
                    const warn = p.status === 'd' ? '<i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24; margin-left:4px; font-size:0.75rem;"></i>' : '';
                    
                    // Ownership: Purple for Diff (<10%), Red for Template (>40%)
                    const s = parseFloat(p.sel);
                    const sStyle = s < 10 ? 'color:#8b5cf6; font-weight:800;' : (s > 40 ? 'color:#ef4444; font-weight:800;' : 'color:#6b7280;');

                    html += `
                        <div class="scout-item" onclick="app.openModal(${p.id})">
                            <div class="scout-left">
                                <img src="https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}${p.pos === 1 ? '_1' : ''}-66.png" style="width:36px; height:45px; object-fit:contain;">
                                <div class="scout-info">
                                    <div>${p.name}${warn}</div>
                                    <div style="font-size:0.75rem; color:#6b7280;">${p.team} • <span style="${sStyle}">${p.sel}% TSB</span></div>
                                </div>
                            </div>
                            <div class="scout-right">
                                <div class="scout-price">£${p.price}m</div>
                                ${dots}
                            </div>
                        </div>
                    `;
                });
            }
            res.innerHTML = html;
        },
        
        searchScout: (query) => {
            clearTimeout(app.searchTimer);
            app.searchTimer = setTimeout(() => app.performSearch(query), 300);
        },

        performSearch: (query) => {
            const resultsContainer = document.getElementById('scoutResults');
            const mainContent = document.getElementById('transferContent');
            if (!query || query.length < 2) {
                resultsContainer.style.display = 'none';
                mainContent.style.display = 'block';
                return;
            }
            mainContent.style.display = 'none';
            resultsContainer.style.display = 'block';
            
            const q = query.toLowerCase();
            const players = Object.values(app.playersCache);
            const matches = players.filter(p => p.name.toLowerCase().includes(q) || (p.team && p.team.toLowerCase().includes(q)));

            // Fix: Sort by Form first, but fallback to Ownership (sel) if form is low/zero
            // This ensures returning stars (like Palmer/Saka) appear even if Form is 0.0
            matches.sort((a,b) => {
                const fA = parseFloat(a.form);
                const fB = parseFloat(b.form);
                if (Math.abs(fA - fB) > 0.5) return fB - fA; // Use Form if difference is significant
                return parseFloat(b.sel) - parseFloat(a.sel); // Otherwise use Ownership
            });
            const top20 = matches.slice(0, 20);
            
            let html = '';
            if (top20.length === 0) {
                html = '<div style="text-align:center; color:#888; padding:20px;">No players found.</div>';
            } else {
                top20.forEach(p => {
                    const fixtures = app.fixMap[p.team_id] || [];
                    let dots = '<div class="t-fdr" style="margin-top:4px;">';
                    // Shift to 1,4 to show next upcoming games
                    fixtures.slice(1,4).forEach(f => { if(f) dots+=`<div class="t-dot bg-${f.diff}">${f.opp}</div>` });
                    dots += '</div>';
                    
                    const s = parseFloat(p.sel);
                    const sStyle = s < 10 ? 'color:#8b5cf6; font-weight:800;' : (s > 40 ? 'color:#ef4444; font-weight:800;' : 'color:#6b7280;');

                    html += `<div class="scout-item" onclick="app.openModal(${p.id})"><div class="scout-left"><img src="https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}${p.pos === 1 ? '_1' : ''}-66.png" style="width:36px; height:45px; object-fit:contain;"><div class="scout-info"><div>${p.name}</div><div style="font-size:0.75rem; color:#6b7280;">${p.team} • <span style="${sStyle}">${p.sel}% TSB</span></div></div></div><div class="scout-right"><div class="scout-price">£${p.price}m</div>${dots}</div></div>`;
                });
            }
            resultsContainer.innerHTML = html;
        },
        
        renderPlanner: () => {
            const container = document.getElementById('plannerGrid');
            const currentGW = parseInt(app.gwName.replace(/\D/g,'')) || 1;
            
            // AI Recommendation - LINKED TO TRANSFERS
            const suggestions = TransferBot.analyze(app.currentPicks, app.playersCache, app.currentBank, app.fixMap, app.ftCount);
            
            // UI: Scenario Selector Bar
            let selectorHtml = '';
            if (suggestions.length > 0) {
                selectorHtml = `<div class="filter-bar" style="margin-bottom:20px;">`;
                suggestions.forEach((s, i) => {
                    const isActive = i === app.plannerSelIndex;
                    const style = isActive ? 'background:var(--primary); color:white; border-color:var(--primary); box-shadow:0 4px 10px rgba(55,0,60,0.3);' : '';
                    selectorHtml += `<div class="filter-pill" style="min-width:100px; padding:8px 12px; ${style}" onclick="app.plannerSelIndex=${i}; app.renderPlanner();">
                        <div style="font-size:0.65rem; opacity:0.8;">${s.type}</div>
                        <div style="font-size:0.8rem;">+${s.diff} pts</div>
                    </div>`;
                });
                selectorHtml += `</div>`;
            }

            // Get Selected Move
            const targetMove = suggestions[app.plannerSelIndex] || null;
            
            // Visual Strategy Feedback (The Card)
            let strategyHtml = '';
            if (targetMove) {
                const moves = targetMove.in.map((pIn, i) => {
                    const pOut = targetMove.out[i];
                    return `<div><span style="color:#ef4444;">${pOut.name}</span> <i class="fa-solid fa-arrow-right" style="font-size:0.7rem; color:#9ca3af; margin:0 4px;"></i> <span style="color:#16a34a; font-weight:800;">${pIn.name}</span></div>`;
                }).join('');
                strategyHtml = `<div style="background:white; border:1px solid var(--border); border-radius:12px; padding:15px; margin-bottom:20px; font-size:0.85rem; box-shadow:0 2px 10px rgba(0,0,0,0.03);"><div style="font-weight:700; color:var(--text-sub); margin-bottom:8px; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid #f3f4f6; padding-bottom:4px;">Analyzing Scenario</div>${moves}</div>`;
            }

            // Analyze Specific Move
            const rec = TransferBot.recommendChips(app.currentPicks, app.fixMap, currentGW, app.historyData, targetMove);
            let aiHtml = '';
            if (rec) {
                // UI: "Mission Control" Theme. Dark Purple for Action, Clean White for Hold.
                const isAction = rec.chip !== 'Save Chips';
                const bg = isAction ? 'linear-gradient(145deg, #37003c 0%, #1f0025 100%)' : 'white';
                const border = isAction ? 'none' : '1px solid var(--border)';
                const txt = isAction ? 'white' : 'var(--text-main)';
                const sub = isAction ? 'rgba(255,255,255,0.7)' : 'var(--text-sub)';
                const badge = isAction ? 'background:#e90052; color:white;' : 'background:#f3f4f6; color:#6b7280;';
                const icon = isAction ? 'color:#fbbf24; text-shadow:0 0 15px rgba(251,191,36,0.5);' : 'color:#9ca3af;';

                aiHtml = `
                <div style="background:${bg}; border:${border}; padding:20px; border-radius:16px; margin-bottom:25px; box-shadow:0 10px 30px -10px rgba(0,0,0,${isAction?0.4:0.05}); position:relative; overflow:hidden;">
                    ${isAction ? '<div style="position:absolute; top:-20px; right:-20px; font-size:8rem; color:white; opacity:0.03; transform:rotate(-20deg); pointer-events:none;"><i class="fa-solid fa-microchip"></i></div>' : ''}
                    <div style="display:flex; justify-content:space-between; align-items:start; position:relative; z-index:2;">
                        <div>
                            <div style="margin-bottom:8px;">
                                <span style="font-size:0.65rem; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:4px 10px; border-radius:20px; ${badge}">
                                    <i class="fa-solid fa-robot" style="margin-right:4px;"></i> AI Intelligence
                                </span>
                            </div>
                            <div style="font-size:1.6rem; font-weight:800; color:${txt}; margin-bottom:6px; letter-spacing:-0.5px;">
                                ${rec.chip}
                            </div>
                            <div style="font-size:0.9rem; color:${sub}; font-weight:500; line-height:1.5; max-width:280px;">
                                ${rec.reason}
                            </div>
                        </div>
                        <div style="font-size:2.5rem; ${icon}">
                            <i class="fa-solid ${rec.chip === 'Wildcard' ? 'fa-wand-magic-sparkles' : (rec.chip === 'Free Hit' ? 'fa-bolt' : (rec.chip === 'Triple Captain' ? 'fa-rocket' : 'fa-shield-halved'))}"></i>
                        </div>
                    </div>
                </div>`;
            }

            // FIX: Create Projected Squad based on selected strategy
            let projectedPicks = JSON.parse(JSON.stringify(app.currentPicks));
            if (targetMove) {
                targetMove.out.forEach((pOut, idx) => {
                    const pIn = targetMove.in[idx];
                    const pick = projectedPicks.find(p => p.element === pOut.id);
                    if (pick) pick.element = pIn.id; // Swap ID for visualization
                });
            }

            // FIX: Add selectorHtml to the final output so buttons appear
            let html = selectorHtml + strategyHtml + aiHtml;
            for (let i = 0; i < 5; i++) {
                const gw = currentGW + i;
                
                // FIX: Dynamic Optimization per Gameweek (Simulate Best XI vs Bench)
                // 1. Score players for this specific future GW
                const rated = projectedPicks.map(p => {
                    const pl = app.playersCache[p.element];
                    const tid = pl ? pl.team_id : 0;
                    const f = (app.fixMap[tid] || [])[i] || { diff: 3, opp: '-' };
                    const score = (parseFloat(pl.form||0)*0.5) + (6 - f.diff); // Simple Score: Form + Fixture
                    return { p, pl, f, score };
                });

                // 2. Pick Best XI (Simple: Best GK + Best 10 Outfielders)
                const gks = rated.filter(x => x.pl.pos === 1).sort((a,b) => b.score - a.score);
                const outfield = rated.filter(x => x.pl.pos !== 1).sort((a,b) => b.score - a.score);
                const starters = [gks[0], ...outfield.slice(0, 10)];
                const bench = [...(gks.slice(1)), ...outfield.slice(10)];

                // 3. Calculate Stats from Best XI (Not raw squad)
                let totalDiff = 0;
                starters.forEach(x => totalDiff += x.f.diff);
                const avgDiff = totalDiff / 11;

                // 4. Best Captain in Starters
                const bestCap = starters.sort((a,b) => b.score - a.score)[0];
                const capOpp = bestCap ? bestCap.f.opp : '-';
                const capDiff = bestCap ? bestCap.f.diff : 3;

                // Bar Visuals: Green (<3) to Red (>4)
                const barWidth = Math.max(10, Math.min(100, (5.5 - avgDiff) * 35)); 
                const barColor = avgDiff < 3.0 ? '#00ff85' : (avgDiff > 3.8 ? '#ef4444' : '#fbbf24');

                // 5. Bench Dots (From Optimization)
                let benchHtml = '';
                bench.forEach(x => {
                     const bColor = x.f.diff < 3 ? '#00ff85' : (x.f.diff > 3 ? '#ef4444' : '#d1d5db');
                     benchHtml += `<div style="width:5px; height:5px; border-radius:50%; background:${bColor};"></div>`;
                });

                html += `
                    <div class="plan-row" style="gap:10px;">
                        <div class="plan-col-gw" style="display:flex; flex-direction:column; justify-content:center; width:45px;">
                            <div>GW${gw}</div>
                            <div style="font-size:0.55rem; color:#888;">Avg ${avgDiff.toFixed(1)}</div>
                        </div>
                        
                        <div style="flex:1;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px;">
                                <div style="font-size:0.6rem; font-weight:700; color:#9ca3af; width:20px;">XI</div>
                                <div style="flex:1; background:#f3f4f6; height:6px; border-radius:4px; overflow:hidden;">
                                    <div style="height:100%; width:${barWidth}%; background:${barColor}; border-radius:4px;"></div>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="font-size:0.6rem; font-weight:700; color:#9ca3af; width:20px;">SUB</div>
                                <div style="display:flex; gap:2px;">${benchHtml}</div>
                                <div style="margin-left:auto; font-size:0.65rem; background:#f3f4f6; padding:1px 4px; border-radius:4px; border:1px solid #e5e7eb; display:flex; align-items:center; gap:4px;">
                                    <span style="color:#6b7280; font-weight:700;">C</span>
                                    <span class="bg-${capDiff}" style="padding:0 4px; border-radius:2px; font-weight:800;">${capOpp}</span>
                                </div>
                            </div>
                        </div>

                        <div class="plan-col-chip" style="margin-left:0;">
                            <select class="plan-select">
                                <option value="">Save</option>
                                <option value="wc" ${rec && rec.gw === gw && rec.chip === 'Wildcard' ? 'selected' : ''}>Wildcard</option>
                                <option value="fh">Free Hit</option>
                                <option value="bb" ${rec && rec.gw === gw && rec.chip === 'Bench Boost' ? 'selected' : ''}>Bench Boost</option>
                                <option value="tc" ${rec && rec.gw === gw && rec.chip === 'Triple Captain' ? 'selected' : ''}>Triple Capt</option>
                            </select>
                        </div>
                    </div>`;
            }
            container.innerHTML = html;
        },

        toggleView: (mode) => {
            if (app.viewMode === mode) return;
            const loader = document.getElementById('viewLoader');
            loader.classList.add('active');
            
            document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`btn-${mode}`).classList.add('active');

            setTimeout(() => {
                app.viewMode = mode;
                
                let renderPicks = app.currentPicks;
                if (mode === 'next') {
                    // Auto-Optimize Lineup for Next GW View
                    const opt = TransferBot.recommendFormation(app.currentPicks, app.playersCache, app.fixMap);
                    renderPicks = [];
                    // 1. Starters
                    opt.bestLineup.forEach((id, i) => {
                        const p = app.currentPicks.find(x => x.element === id);
                        if (p) renderPicks.push({ ...p, position: i + 1 });
                    });
                    // 2. Bench
                    opt.bench.forEach((player, i) => {
                        const p = app.currentPicks.find(x => x.element === player.id);
                        if (p) renderPicks.push({ ...p, position: 12 + i });
                    });

                    // 3. Auto-Captain (From Optimizer)
                    renderPicks.forEach(p => {
                        p.is_captain = (p.element === opt.captain);
                        p.is_vice_captain = (p.element === opt.vice);
                        p.multiplier = p.is_captain ? 2 : 1;
                    });
                }

                app.render(app.userData, renderPicks, app.playersCache, app.fixMap, app.statusMap, app.currentStats, app.historyData, app.deadline, app.gwName);
                setTimeout(() => { loader.classList.remove('active'); }, 50);
            }, 300);
        },

        simulate: (outIds, inIds) => {
            const simPicks = JSON.parse(JSON.stringify(app.currentPicks));
            let simBank = app.currentBank;
            outIds.forEach((outId, idx) => {
                const inId = inIds[idx];
                const pickIdx = simPicks.findIndex(p => p.element === outId);
                if (pickIdx !== -1) {
                    simPicks[pickIdx].element = inId;
                    const pOut = app.playersCache[outId];
                    const pIn = app.playersCache[inId];
                    
                    // FIX: Use Real Selling Price (Pre-calculated in app.load)
                    const realSellPrice = (simPicks[pickIdx].selling_price) ? simPicks[pickIdx].selling_price / 10 : pOut.price;
                    simBank = simBank + realSellPrice - pIn.price;

                    simPicks[pickIdx].multiplier = 1; 
                    simPicks[pickIdx].is_captain = false;
                    simPicks[pickIdx].is_vice_captain = false;
                }
            });
            // --- AUTO OPTIMIZE FORMATION ---
            const opt = TransferBot.recommendFormation(simPicks, app.playersCache, app.fixMap);
            const finalPicks = [];
            // 1. Add Starters (Indices 0-10)
            opt.bestLineup.forEach((id, i) => {
                const p = simPicks.find(x => x.element === id);
                p.position = i + 1;
                finalPicks.push(p);
            });
            // 2. Add Bench (Indices 11-14)
            opt.bench.forEach((player, i) => {
                const p = simPicks.find(x => x.element === player.id);
                p.position = 12 + i;
                finalPicks.push(p);
            });

            // 3. Apply Captaincy from Optimizer
            finalPicks.forEach(p => {
                p.is_captain = (p.element === opt.captain);
                p.is_vice_captain = (p.element === opt.vice);
                p.multiplier = p.is_captain ? 2 : 1;
            });

            app.currentTool = 'squad';
            app.isSimulating = true;
            app.simNewIds = inIds;
            
            // Force Next GW View
            app.viewMode = 'next';
            document.querySelectorAll('.vt-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-next').classList.add('active');

            document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
            document.getElementById('nav-squad').classList.add('active');
            const simStats = { ...app.currentStats, bank: simBank * 10, value: app.currentStats.value };
            app.render(app.userData, finalPicks, app.playersCache, app.fixMap, app.statusMap || {}, simStats, app.historyData, app.deadline, app.gwName);
            
            // Calculate XP Gain (Optimized vs Optimized)
            const calcXP = (pList) => {
                const o = TransferBot.recommendFormation(pList, app.playersCache, app.fixMap);
                let t = 0, m = 0;
                o.bestLineup.forEach(id => {
                    const pl = app.playersCache[id];
                    const f = (app.fixMap[pl.team_id]||[])[1] || {diff:3};
                    const pts = (parseFloat(pl.form||0)*0.5) + (6-f.diff);
                    t += pts; m = Math.max(m, pts);
                });
                return t + m;
            };
            const gain = (calcXP(simPicks) - calcXP(app.currentPicks)).toFixed(1);
            const gainHtml = gain > 0 ? `<span style="font-size:0.75rem; background:rgba(255,255,255,0.25); padding:3px 8px; border-radius:6px; margin-left:10px; font-weight:800;">+${gain} xP</span>` : '';

            // Redirect Reset to Transfers
            const bannerHtml = `<div class="sim-banner"><div><i class="fa-solid fa-wand-magic-sparkles"></i> Preview ${gainHtml}</div><div class="sim-btn" onclick="app.switchTool('transfers', true)">Reset</div></div>`;
            const dash = document.getElementById('dashboardView');
            const existingBanner = dash.querySelector('.sim-banner');
            if (existingBanner) existingBanner.remove();
            dash.insertAdjacentHTML('afterbegin', bannerHtml);
        },

        load: async (savedId = null) => {
            const id = savedId || document.getElementById('teamID').value;
            if (!id) return alert("Enter ID");
            localStorage.setItem('fpl_id_final', id);
            app.suggestionCache = null; // Clear cache on reload
            document.getElementById('userIcon').classList.add('active');
            app.show('loadingView');

            try {
                document.getElementById('loadingMsg').innerText = "Connecting...";
                
                // Parallel Fetch 1: Core Data (Static, User, History) - Added Timestamp to bust cache
                const t = Date.now();
                const [staticData, user, history] = await Promise.all([
                    app.fetchUrl(`https://fantasy.premierleague.com/api/bootstrap-static/?t=${t}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/entry/${id}/?t=${t}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/entry/${id}/history/?t=${t}`)
                ]);

                app.userData = user;
                app.historyData = history;

                const gwEvent = staticData.events.find(e => e.is_current) || staticData.events[0];
                const gw = gwEvent.id;
                
                const nextEvent = staticData.events.find(e => e.is_next);
                app.deadline = nextEvent ? nextEvent.deadline_time : null;
                app.gwName = nextEvent ? nextEvent.name : 'GW-';

                document.getElementById('loadingMsg').innerText = "Fetching Live Scores...";
                
                // Parallel Fetch 2: GW Dependent Data (+ TRANSFERS for Budget Calc)
                const [picks, liveData, fix1, fix2, fix3, fix4, transfers] = await Promise.all([
                    app.fetchUrl(`https://fantasy.premierleague.com/api/entry/${id}/event/${gw}/picks/`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/event/${gw}/live/`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/fixtures/?event=${gw}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/fixtures/?event=${gw+1}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/fixtures/?event=${gw+2}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/fixtures/?event=${gw+3}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/entry/${id}/transfers/`)
                ]);

                app.currentStats = picks.entry_history;
                app.currentStats.active_chip = picks.active_chip; // FIX: Capture active chip for Bench Boost logic
                
                const liveMap = {};
                app.lastEvents = {};
                liveData.elements.forEach(el => {
                    liveMap[el.id] = { points: el.stats.total_points, mins: el.stats.minutes, goals: el.stats.goals_scored, assists: el.stats.assists, red_cards: el.stats.red_cards, own_goals: el.stats.own_goals, yellow_cards: el.stats.yellow_cards, goals_conceded: el.stats.goals_conceded };
                    app.lastEvents[el.id] = { goals: el.stats.goals_scored, assists: el.stats.assists, red_cards: el.stats.red_cards, yellow_cards: el.stats.yellow_cards, goals_conceded: el.stats.goals_conceded };
                });
                
                const teamShort = {};
                staticData.teams.forEach(t => teamShort[t.id] = t.short_name);
                app.teams = teamShort;

                // --- MATCH STATUS MAP ---
                const statusMap = {};
                if (fix1) {
                    fix1.forEach(f => {
                        let status = 'FIX';
                        let label = new Date(f.kickoff_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        if (f.finished || f.finished_provisional) { 
                            status = 'FT'; 
                            label = 'FT'; 
                        } else if (f.started) { 
                            status = 'LIVE'; 
                            label = 'LIVE'; 
                        }
                        const score = (f.started || f.finished || f.finished_provisional) ? { h: f.team_h_score, a: f.team_a_score } : null;
                        statusMap[f.team_h] = { status, label, id: f.id, score };
                        statusMap[f.team_a] = { status, label, id: f.id, score };
                    });
                }
                app.statusMap = statusMap;

                // FIX: Sync Status from Live Data (More accurate than Fixtures API)
                if (liveData.fixtures) {
                    liveData.fixtures.forEach(f => {
                        if (f.finished || f.finished_provisional) {
                            if (app.statusMap[f.team_h]) app.statusMap[f.team_h].status = 'FT';
                            if (app.statusMap[f.team_a]) app.statusMap[f.team_a].status = 'FT';
                        }
                    });
                }

                const processFix = (fixList) => {
                    const map = {};
                    if (!fixList) return map;
                    fixList.forEach(f => {
                        if (!map[f.team_h]) map[f.team_h] = [];
                        if (!map[f.team_a]) map[f.team_a] = [];
                        map[f.team_h].push({ opp: teamShort[f.team_a], diff: f.team_h_difficulty, is_home: true });
                        map[f.team_a].push({ opp: teamShort[f.team_h], diff: f.team_a_difficulty, is_home: false });
                    });
                    return map;
                };
                const map1 = processFix(fix1); const map2 = processFix(fix2); const map3 = processFix(fix3); const map4 = processFix(fix4);
                
                // NEW: Handle Double (DGW) and Blank (BGW) Gameweeks
                const getFix = (list) => {
                    if (!list || list.length === 0) return { opp: 'BLK', diff: 8, is_home: false }; // Blank Penalty
                    if (list.length === 1) return list[0]; 
                    // DGW: Combine Opponents & Lower Difficulty (Bonus)
                    const d = (list.reduce((a,b)=>a+b.diff,0) / list.length) - 1.5; 
                    return { opp: list.map(x=>x.opp).join('+'), diff: Math.max(1, d), is_home: list[0].is_home };
                };

                const masterFixMap = {};
                staticData.teams.forEach(t => {
                    masterFixMap[t.id] = [getFix(map1[t.id]), getFix(map2[t.id]), getFix(map3[t.id]), getFix(map4[t.id])];
                });
                app.fixMap = masterFixMap;

                const players = {};
                staticData.elements.forEach(p => {
                    const live = liveMap[p.id];
                    players[p.id] = {
                        id: p.id, name: p.web_name, team: teamShort[p.team], team_id: p.team,
                        pos: p.element_type, price: p.now_cost / 10,
                        now_cost: p.now_cost, // Store raw integer for precision math
                        event_points: live ? live.points : p.event_points,
                        minutes: live ? live.mins : 0,
                        stats: live || { goals: 0, assists: 0, red_cards: 0 },
                        team_code: p.team_code, status: p.status, chance: p.chance_of_playing_next_round, news: p.news, cost_change: p.cost_change_event,
        // Track total price rise for budget calculation
        cost_change_start: p.cost_change_start,
        sel: parseFloat(p.selected_by_percent), form: p.form, transfers_in: p.transfers_in_event, transfers_out: p.transfers_out_event, total_points: p.total_points, ict_index: p.ict_index
    };
});

                app.playersCache = players;

                // --- LIVE BONUS PROJECTION LOGIC (INITIAL LOAD) ---
                // RESET: Removed projections. Relying 100% on Official FPL Data.
                app.bonusMap = {};

                // FIX: SMART BUDGET CALCULATION
                // 1. If player exists in transfer history -> Use that price (Exact)
                // 2. If player is from Initial Squad (GW1) -> Use Cost Change Math (Fixes Stale Data)
                // 3. If Late Joiner & No History -> Fallback to API (Safe)
                const startGw = user.started_event || 1;

                app.currentPicks = picks.picks.map(pick => {
                    const p = players[pick.element];
                    
                    // Step A: Try to find confirmed purchase in History
                    let pp = pick.purchase_price ?? null;
if (transfers && transfers.length > 0) {
    const history = transfers
        .filter(t => t.element_in === pick.element)
        .sort((a,b) => new Date(b.time) - new Date(a.time));
    if (history.length > 0 && typeof history[0].element_in_cost === 'number') {
        pp = history[0].element_in_cost;
    }
}

                    // Step B: If no history found, assume bought at Season Start (Conservative Fallback)
                    // This ensures we don't overestimate budget. Better to have "hidden funds" than "insufficient funds".
                    if (pp === null) {
                        pp = p.now_cost - p.cost_change_start;
                    }

                    // Step C: Calculate Fresh Selling Price
                    let finalSellingPrice = pick.selling_price; // Default to API
                    
                    if (pp !== null) {
                        // We have a confirmed purchase price, so we can fix stale API data
                        if (p.now_cost > pp) {
                            const profit = p.now_cost - pp;
                            const gain = Math.floor(profit / 2); // Round Down (FPL Rule)
                            finalSellingPrice = pp + gain;
                        } else {
                            finalSellingPrice = p.now_cost; // Loss or Break-even
                        }
                    }

                    return { ...pick, purchase_price: pp, selling_price: finalSellingPrice };
                });
                
                app.currentBank = picks.entry_history.bank / 10;
                document.getElementById('demoAlert').classList.add('hidden');
                
                if (app.liveInterval) clearInterval(app.liveInterval);
                app.liveInterval = setInterval(() => app.checkLiveEvents(gw), 60000);

                app.render(user, picks.picks, players, masterFixMap, app.statusMap, picks.entry_history, history, app.deadline, app.gwName);

            } catch (error) {
                console.error("Data Fetch Failed:", error);
                document.getElementById('demoAlert').classList.remove('hidden');
                const mPlayers = {};
                Object.keys(MOCK_DATA.players).forEach(k => mPlayers[k] = { ...MOCK_DATA.players[k], id: k, team: 'MOCK' });
                app.playersCache = mPlayers;
                setTimeout(() => { 
                    app.render(MOCK_DATA.user, MOCK_DATA.picks, mPlayers, {}, {}, { bank: 5, value: 1000 }, { chips: [] }, new Date().toISOString(), "GW Demo"); 
                }, 500);
            }
        },
        
        checkLiveEvents: async (gw) => {
            try {
                // Fetch both Live Stats AND Fixtures (for Match Clock)
                const [liveData, fixData] = await Promise.all([
                    app.fetchUrl(`https://fantasy.premierleague.com/api/event/${gw}/live/?t=${Date.now()}`),
                    app.fetchUrl(`https://fantasy.premierleague.com/api/fixtures/?event=${gw}&t=${Date.now()}`)
                ]);

                // 1. Update Match Status (Time, HT, FT)
                if (fixData) {
                    fixData.forEach(f => {
                        let status = 'FIX';
                        let label = new Date(f.kickoff_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                        
                        if (f.finished_provisional || f.finished) { 
                            status = 'FT'; label = 'FT'; 
                        } else if (f.started) { 
                            status = 'LIVE'; 
                            // Check for Half Time (approx logic) or regular minutes
                            if (f.minutes === 45 && !f.finished_provisional && Date.now() - new Date(f.kickoff_time).getTime() > 60*60*1000) label = "HT";
                            else label = f.minutes + "'";
                        }
                        
                        const score = (f.started || f.finished || f.finished_provisional) ? { h: f.team_h_score, a: f.team_a_score } : null;
                        // Update the global map so pills can read it
                        if (app.statusMap[f.team_h]) { Object.assign(app.statusMap[f.team_h], { status, label, score }); }
                        if (app.statusMap[f.team_a]) { Object.assign(app.statusMap[f.team_a], { status, label, score }); }
                    });
                }

                // 2. Update Player Stats
                liveData.elements.forEach(el => {
                    const pid = el.id;
                    const p = app.playersCache[pid];
                    if (!p) return;
                    
                    const newStats = { goals: el.stats.goals_scored, assists: el.stats.assists, red_cards: el.stats.red_cards, yellow_cards: el.stats.yellow_cards, goals_conceded: el.stats.goals_conceded };
                    const old = app.lastEvents[pid] || newStats;
                    
                    // Update Cache
                    p.event_points = el.stats.total_points;
                    p.minutes = el.stats.minutes;
                    p.stats = { ...p.stats, ...newStats, own_goals: el.stats.own_goals };

                    // Notify Squad
                    const inSquad = app.currentPicks.some(x => x.element === pid);
                    if (inSquad && Notification.permission === 'granted') {
                        const icon = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}-66.png`;
                        if (newStats.goals > old.goals) new Notification(`⚽ GOAL! ${p.name}`, { body: `${p.team} • Total: ${el.stats.total_points}pts`, icon });
                        if (newStats.assists > old.assists) new Notification(`🅰️ ASSIST! ${p.name}`, { body: `${p.team} • Total: ${el.stats.total_points}pts`, icon });
                        if (newStats.red_cards > old.red_cards) new Notification(`🟥 RED CARD! ${p.name}`, { body: `Sent off for ${p.team}`, icon });
                        if (newStats.yellow_cards > old.yellow_cards) new Notification(`🟨 Yellow Card! ${p.name}`, { body: `${p.team}`, icon });
                    }
                    app.lastEvents[pid] = newStats;
                });

                // --- LIVE BONUS PROJECTION LOGIC ---
                // RESET: Removed projections. Relying 100% on Official FPL Data.
                app.bonusMap = {};

                // Only re-render live data if the user is NOT in Preview/Simulation mode
                if (app.currentTool === 'squad' && !app.isSimulating) app.render(app.userData, app.currentPicks, app.playersCache, app.fixMap, app.statusMap, app.currentStats, app.historyData, app.deadline, app.gwName);
            } catch (e) {}
        },

        render: (user, picks, players, fixMap, statusMap, stats, history, deadline, gwName) => {
            // 1. Calculate Auto-Subs & Score Projection
            const subOutIds = [];
            const subInIds = [];
            const played = (p) => p && p.minutes > 0;
            const didntPlay = (p) => {
                if (!p || p.minutes > 0) return false;
                const m = statusMap[p.team_id];
                return (m && m.status === 'FT') || p.chance === 0;
            };

            // Calculate Subs (GK + Outfield)
            const startGK = players[picks[0].element];
            const subGK = players[picks[11].element];
            if (didntPlay(startGK) && played(subGK)) { subOutIds.push(startGK.id); subInIds.push(subGK.id); }

            // Fix: Track formation counts to ensure valid sub (Min 3 Def, Min 1 Fwd)
            let defCount = 0, fwdCount = 0;
            for (let i = 1; i <= 10; i++) {
                const p = players[picks[i].element];
                if (p.pos === 2) defCount++;
                if (p.pos === 4) fwdCount++;
            }

            const outfieldBench = [12, 13, 14].map(i => players[picks[i].element]);
            const usedBenchIds = new Set(); 

            for (let i = 1; i <= 10; i++) {
                const starter = players[picks[i].element];
                if (didntPlay(starter)) {
                    // Check validity constraints
                    const needsDef = (starter.pos === 2 && defCount <= 3);
                    const needsFwd = (starter.pos === 4 && fwdCount <= 1);

                    for (const sub of outfieldBench) {
                        if (played(sub) && !usedBenchIds.has(sub.id)) {
                            // Skip if sub breaks formation rules
                            if (needsDef && sub.pos !== 2) continue; 
                            if (needsFwd && sub.pos !== 4) continue;

                            subOutIds.push(starter.id); subInIds.push(sub.id);
                            usedBenchIds.add(sub.id);
                            
                            // Update counts
                            if (starter.pos === 2) defCount--;
                            if (starter.pos === 4) fwdCount--;
                            if (sub.pos === 2) defCount++;
                            if (sub.pos === 4) fwdCount++;
                            break;
                        }
                    }
                }
            }

            // FIX: If Bench Boost is active, disable auto-subs (everyone plays)
            if (stats.active_chip === 'bboost') { subOutIds.length = 0; subInIds.length = 0; }

            // Calculate Score with Subs & VC
            let liveScore = 0, playedCount = 0;
            const capPick = picks.find(p => p.is_captain);
            // Fix: Check minutes directly (armband passes even if no sub possible)
            const capDidntPlay = capPick && didntPlay(players[capPick.element]);

            picks.forEach(pick => {
                const p = players[pick.element];
                if (!p) return;
                const isStarter = pick.position <= 11;
                const isSubIn = subInIds.includes(pick.element);
                const isSubOut = subOutIds.includes(pick.element);
                
                // FIX: Include Bench Boost players in score
                if (stats.active_chip === 'bboost' || (isStarter && !isSubOut) || isSubIn) {
                    let mult = pick.multiplier;
                    if (capDidntPlay) {
                        if (pick.is_captain) mult = 1; // Cap didn't play
                        if (pick.is_vice_captain) mult = capPick.multiplier; // VC becomes Cap (inherits TC)
                    }

                    const bonus = (app.viewMode === 'live' && app.bonusMap[pick.element]) ? app.bonusMap[pick.element] : 0;
                    liveScore += ((p.event_points + bonus) * mult);
                    if (p.minutes > 0) playedCount++;
                }
            });
            const oldGwScore = user.summary_event_points || 0;
            const totalDiff = liveScore - oldGwScore;
            const liveTotal = (user.summary_overall_points || 0) + totalDiff;

            document.getElementById('dispName').innerText = user.name;

            if (app.viewMode === 'next') {
                let xpTotal = 0, diffTotal = 0, count = 0;
                picks.forEach(p => {
                    if (p.position <= 11) {
                        const pl = players[p.element];
                        if (pl) {
                            const f = (fixMap[pl.team_id]||[])[1] || {diff:3};
                            // xP Formula: (Form + Ease) * Chance of Playing
                            let chance = (pl.chance !== null ? pl.chance : 100) / 100;
                            let xP = ((parseFloat(pl.form||0)*0.5) + ((6-f.diff)*1.0)) * chance;
                            
                            xpTotal += (xP * (p.multiplier || 1));
                            diffTotal += f.diff; count++;
                        }
                    }
                });
                // Fix: Targeting the new class .sb-hero-label and .sb-label
                document.getElementById('dispGW').previousElementSibling.innerText = "Projected Pts";
                // FIX: Flex layout - Gradient on Number, Solid on Label
                document.getElementById('dispGW').innerHTML = `<span style="background:linear-gradient(180deg,#fff 0%,#e0e7ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${xpTotal.toFixed(1)}</span><span style="font-size:1rem;color:#a5b4fc;font-weight:700;">xP</span>`;
                document.getElementById('dispTotal').previousElementSibling.innerText = "Avg Difficulty";
                document.getElementById('dispTotal').innerText = count ? (diffTotal/count).toFixed(1) : '0.0';
            } else {
                document.getElementById('dispGW').previousElementSibling.innerText = "GW Points";
                // FIX: Gradient on Number
                document.getElementById('dispGW').innerHTML = `<span style="background:linear-gradient(180deg,#fff 0%,#e0e7ff 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${liveScore}</span>`; 
                document.getElementById('dispTotal').previousElementSibling.innerText = "Total Points";
                document.getElementById('dispTotal').innerText = liveTotal;
            }

            // --- HISTORY GRAPH (Last 5 GWs) ---
            if (history.current && history.current.length > 0) {
                const recents = history.current.slice(-5);
                const maxPts = Math.max(...recents.map(r => r.points), 60); // Scale baseline
                
                let graphHtml = '';
                recents.forEach((r, i) => {
                    const prev = recents[i-1] || r;
                    const isGreen = r.overall_rank < prev.overall_rank;
                    const isRed = r.overall_rank > prev.overall_rank;
                    const barClass = isGreen ? 'hb-green' : (isRed ? 'hb-red' : 'hb-gray');
                    const hPct = Math.max(10, (r.points / maxPts) * 100);
                    
                    graphHtml += `<div class="hist-col">
                        <div class="hist-val">${r.points}</div>
                        <div class="hist-bar ${barClass}" style="height:${hPct}%;"></div>
                        <div class="hist-gw">GW${r.event}</div>
                    </div>`;
                });
                document.getElementById('historyGraph').innerHTML = graphHtml;
            }

            let rankArrow = '<i class="fa-solid fa-minus r-grey"></i>';
            const currentRank = user.summary_overall_rank || 0;
            
            // Logic: If last history entry has same rank as current, fallback to previous entry to show movement
            let lastRank = 0;
            if (history.current && history.current.length > 0) {
                const last = history.current[history.current.length - 1];
                if (last.overall_rank === currentRank && history.current.length > 1) {
                    lastRank = history.current[history.current.length - 2].overall_rank;
                } else {
                    lastRank = last.overall_rank;
                }
            }

            let diffStr = '';
            if (lastRank > 0 && currentRank > 0 && lastRank !== currentRank) {
                const rawDiff = lastRank - currentRank; 
                const abs = Math.abs(rawDiff);
                const fmt = abs > 999999 ? (abs/1000000).toFixed(1)+'m' : (abs > 999 ? (abs/1000).toFixed(0)+'k' : abs);
                
                // Pill Logic: Up (Green) or Down (Red)
                const pClass = rawDiff > 0 ? 'rp-up' : 'rp-down';
                const pIcon = rawDiff > 0 ? '▲' : '▼';
                diffStr = `<div class="rank-pill ${pClass}">${pIcon} ${fmt}</div>`;
            }

            // Clean Display: Value + Ticker Pill
            document.getElementById('dispRank').innerHTML = `<div class="rank-wrap"><span>${currentRank.toLocaleString()}</span>${diffStr}</div>`;

            document.getElementById('dispBank').innerText = `£${(stats.bank / 10).toFixed(1)}m`;
            const valHtml = `£${(stats.value / 10).toFixed(1)}m` + (app.viewMode === 'next' ? ' <span style="background:#fbbf24; color:#78350f; font-size:0.6rem; padding:1px 6px; border-radius:4px; font-weight:800; vertical-align:2px;">AI LINEUP</span>' : '');
            document.getElementById('dispValue').innerHTML = valHtml;

            if (app.timer) clearInterval(app.timer);
            const updateTime = () => {
                const now = new Date().getTime();
                const countDate = new Date(deadline).getTime();
                const gap = countDate - now;
                if (gap > 0) {
                    const d = Math.floor(gap / (1000 * 60 * 60 * 24));
                    const h = Math.floor((gap % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const m = Math.floor((gap % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((gap % (1000 * 60)) / 1000);

                    // 24 Hour Reminder
                    if (gap <= 86400000 && !app.dayNotified) {
                        if (Notification.permission === "granted") new Notification(`📅 1 Day to Deadline`, { body: "Check injury news & price changes.", icon: "https://fantasy.premierleague.com/static/libs/theme-legacy/icons/touch-icon-192x192.png" });
                        app.dayNotified = true;
                    }

                    // 1 Hour Deadline Warning
                    if (gap <= 3600000 && !app.deadlineNotified) {
                        if (Notification.permission === "granted") new Notification(`⚠️ FPL Deadline in 1 Hour!`, { body: "Finalize your team now." });
                        app.deadlineNotified = true;
                    }

                    const isUrgent = d === 0 ? 'urgent' : '';
                    document.getElementById('gwCountdown').innerHTML = `<div class="cd-label"><div class="status-dot ${isUrgent}"></div>${gwName}</div><div class="cd-time">${d}d : ${h.toString().padStart(2, '0')}h : ${m.toString().padStart(2, '0')}m : ${s.toString().padStart(2, '0')}s</div>`;
                } else {
                    document.getElementById('gwCountdown').innerHTML = `<div class="cd-label" style="border:none; padding:0; color:#ef4444;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i> Deadline Passed</div>`;
                    clearInterval(app.timer);
                }
            };
            updateTime();
            app.timer = setInterval(updateTime, 1000);

            const usedChips = history.chips.map(c => c.name);
            const chipMap = { 'wildcard': 'WC', 'freehit': 'FH', 'bboost': 'BB', '3xc': 'TC' };
            const allChips = ['wildcard', 'freehit', 'bboost', '3xc'];
            const chipHtml = allChips.map(c => {
                const isUsed = usedChips.includes(c);
                return `<div class="${isUsed ? 'chip-pill used' : 'chip-pill active'}">${chipMap[c]}</div>`;
            }).join('');
            document.getElementById('chipBar').innerHTML = chipHtml;

            // CAPTAINCY INTEL (Context Aware: 0 for Live, 1 for Next GW)
            const fIdx = app.viewMode === 'next' ? 1 : 0;
            const capRec = TransferBot.analyzeCaptaincy(picks, players, fixMap, fIdx);
            const capDiv = document.getElementById('capRecommendation');
            if (capRec) {
                const isSwitch = capRec.best.name !== capRec.cur.name && (capRec.best.score - capRec.cur.score) > 0.5;
                const bg = isSwitch ? '#fffbeb' : '#f0fdf4';
                const border = isSwitch ? '#fcd34d' : '#bbf7d0';
                const iconColor = isSwitch ? '#d97706' : '#16a34a';
                const titleColor = isSwitch ? '#b45309' : '#166534';
                const title = isSwitch ? 'Captaincy Alert' : 'Captain Active';
                const msg = isSwitch 
                    ? `Switch <strong>${capRec.cur.name}</strong> <i class="fa-solid fa-arrow-right" style="font-size:0.7rem; margin:0 4px; opacity:0.6;"></i> <strong>${capRec.best.name}</strong>`
                    : `Great choice! <strong>${capRec.cur.name}</strong> is the best option this week.`;
                
                const viceMsg = (capRec.vice && capRec.curVice && capRec.vice.name !== capRec.curVice.name)
                     ? `<div style="font-size:0.75rem; margin-top:4px; color:#666; font-weight:500;">Vice: Switch <strong>${capRec.curVice.name}</strong> to <strong>${capRec.vice.name}</strong></div>`
                     : (capRec.vice ? `<div style="font-size:0.75rem; margin-top:4px; color:#666; font-weight:500;">Vice: <strong>${capRec.vice.name}</strong> is optimal.</div>` : '');

                capDiv.innerHTML = `<div style="background:${bg}; border:1px solid ${border}; padding:12px; border-radius:12px; margin-bottom:20px; display:flex; align-items:center; gap:12px; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                    <div style="font-size:1.8rem; color:${iconColor};"><i class="fa-solid fa-copyright"></i></div>
                    <div>
                        <div style="font-size:0.75rem; font-weight:700; color:${titleColor}; text-transform:uppercase; letter-spacing:0.5px;">${title}</div>
                        <div style="font-size:0.9rem; font-weight:600; color:${isSwitch ? '#78350f' : '#14532d'};">${msg}</div>
                        ${viceMsg}
                    </div>
                </div>`;
            } else {
                capDiv.innerHTML = '';
            }

            // (Sub logic moved to top)

            const pitchDiv = document.getElementById('pitchRows');
            const benchDiv = document.getElementById('benchRow');
            pitchDiv.innerHTML = ''; benchDiv.innerHTML = '';
            const formation = { 1: [], 2: [], 3: [], 4: [] };
            for (let i = 0; i < 11; i++) {
                const pick = picks[i];
                const p = players[pick.element];
                if (p) formation[p.pos].push({ ...p, is_captain: pick.is_captain, is_vice: pick.is_vice_captain, multiplier: pick.multiplier, subStatus: subOutIds.includes(p.id) ? 'out' : null });
            }
            [1, 2, 3, 4].forEach(posId => {
                const row = document.createElement('div'); row.className = 'field-row';
                formation[posId].forEach(p => row.innerHTML += app.createPill(p, fixMap, statusMap, false, 0, p.subStatus));
                pitchDiv.appendChild(row);
            });
            for (let i = 11; i < picks.length; i++) {
                const pick = picks[i];
                const p = players[pick.element];
                if (p) {
                    const status = subInIds.includes(p.id) ? 'in' : null;
                    benchDiv.innerHTML += app.createPill({ ...p, is_captain: false, is_vice: false, multiplier: pick.multiplier }, fixMap, statusMap, true, i - 10, status);
                }
            }
            
            if (app.currentTool === 'transfers' && !app.isSimulating) {
                app.switchTool('transfers', true); // True = Suppress menu toggle
            } else {
                app.show('dashboardView');
            }
        },

        createPill: (p, fixMap, statusMap, isBench = false, benchNum = 0, subStatus = null) => {
            let capBadge = p.is_captain ? `<div class="captain-badge">C</div>` : (p.is_vice ? `<div class="captain-badge vice-badge">V</div>` : '');
            // Status moved to Stack
            let extraClass = subStatus === 'out' ? 'did-not-play' : (subStatus === 'in' ? 'coming-on' : '');
            let subIcon = subStatus === 'in' ? `<div class="sub-icon"><i class="fa-solid fa-arrow-up"></i></div>` : '';
            let newBadge = (app.isSimulating && app.simNewIds && app.simNewIds.includes(p.id)) ? `<div class="new-badge">NEW</div>` : '';
            if (newBadge) extraClass += ' sim-new';
            if (p.is_captain) extraClass += ' captain-card';

            // --- CS SHIELD (Live Only, GK/DEF, >0 Mins, 0 Conceded) ---
            let csShield = '';
            if (app.viewMode === 'live' && !app.isSimulating && p.stats && p.pos <= 2 && p.minutes > 0 && p.stats.goals_conceded === 0) {
                csShield = `<div class="cs-shield"><i class="fa-solid fa-shield-halved"></i></div>`;
            }

            // --- LIVE BADGE LOGIC ---
            let matchBadge = '';
            if (app.viewMode === 'live' && !app.isSimulating && statusMap && statusMap[p.team_id]) {
                const m = statusMap[p.team_id];
                let badgeClass = 'ms-fix';
                let label = m.label;
                
                if (m.status === 'FT') { 
                    badgeClass = 'ms-ft'; 
                    if (m.score) label = `${m.score.h}-${m.score.a}`;
                } 
                else if (m.status === 'LIVE') { 
                    badgeClass = 'ms-live'; 
                    if (m.score) label = `${m.score.h}-${m.score.a}`;
                }
                matchBadge = `<div class="match-status ${badgeClass}">${label}</div>`;
            }

            let evtHtml = '';
            // FIX: Vertical Event Stack (Right Side) - Keeps Jersey Visible
            if (app.viewMode === 'live' && p.stats) {
                // Stack container positioned absolute right
                evtHtml = '<div style="position:absolute; top:4px; right:2px; display:flex; flex-direction:column; gap:2px; z-index:25; align-items:end;">';
                
                // Helper for small icons
                const iconStyle = (bg, col) => `background:${bg}; color:${col}; width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.6rem; box-shadow:0 1px 2px rgba(0,0,0,0.1); border:1px solid white;`;

                for(let i=0; i<p.stats.goals; i++) evtHtml += `<div style="${iconStyle('#16a34a','white')}"><i class="fa-solid fa-futbol"></i></div>`;
                for(let i=0; i<p.stats.assists; i++) evtHtml += `<div style="${iconStyle('#3b82f6','white')}"><i class="fa-solid fa-share" style="transform:scaleX(-1)"></i></div>`;
                if (p.stats.red_cards > 0) evtHtml += `<div style="${iconStyle('#ef4444','white')}; border-radius:2px;"></div>`;
                else if (p.stats.yellow_cards > 0) evtHtml += `<div style="${iconStyle('#fbbf24','white')}; border-radius:2px;"></div>`;
                if (p.stats.own_goals > 0) evtHtml += `<div style="${iconStyle('#1f2937','#ef4444')}">OG</div>`;
                
                evtHtml += '</div>';
            }

            const fixtures = fixMap[p.team_id] || [{ diff: 3, opp: '-' }, { diff: 3, opp: '-' }, { diff: 3, opp: '-' }];
            let dotsHtml = '<div class="fdr-row">';
            // Refinement: Home = BOLD CAPS, Away = lighter lowercase
            fixtures.slice(0, 3).forEach(f => { 
                const opp = f.is_home ? f.opp : f.opp.toLowerCase();
                const style = f.is_home ? '' : 'font-weight:500; opacity:0.9;';
                dotsHtml += `<div class="fdr-dot bg-${f.diff}" style="${style}">${opp}</div>`; 
            });
            dotsHtml += '</div>';

            // Hide FDR dots in Live Mode to reduce clutter
            if (app.viewMode === 'live') dotsHtml = ''; 
            
            const kitUrl = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}${p.pos === 1 ? '_1' : ''}-66.png`;
            const bonus = (app.viewMode === 'live' && app.bonusMap[p.id]) ? app.bonusMap[p.id] : 0;
            const bonusHtml = bonus > 0 ? `<span style="color:var(--accent); font-size:0.55rem; margin-left:2px;">+${bonus}</span>` : '';
            const displayPoints = (p.event_points + bonus) * (p.multiplier || 1);

            // Performance Colors: Gold (10+), Green (6+), Grey (<3)
            let ptsBg = 'var(--primary)';
            if (displayPoints >= 10) ptsBg = '#ca8a04';
            else if (displayPoints >= 6) ptsBg = '#16a34a';
            else if (displayPoints < 3) ptsBg = '#6b7280';

            // --- NEXT GW MODE ---
            let pcArrow = p.cost_change > 0 ? `<span class="pc-arrow pc-up">▲</span>` : (p.cost_change < 0 ? `<span class="pc-arrow pc-down">▼</span>` : '');
            let bottomBar = `<div class="pill-data"><span>£${p.price}${pcArrow}</span><span class="points-badge" style="background:${ptsBg}">${displayPoints}${bonusHtml}</span></div>`;

            // Smart Live: Seamless Footer (Flush with Card Radius)
            if (app.viewMode === 'live' && !app.isSimulating) {
                const s = parseFloat(p.sel);
                const valColor = s < 10 ? '#8b5cf6' : (s > 40 ? '#ef4444' : '#374151');
                
                // Solid block style for flush look
                const blockStyle = "flex:1; height:20px; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800;";

                // FIX: Manually apply border-radius since we removed overflow:hidden from parent
                bottomBar = `<div style="display:flex; width:100%; margin-top:2px; border-top:1px solid #f3f4f6;">
                   <div style="${blockStyle} background:#fff; color:${valColor}; border-radius: 0 0 0 10px;">£${p.price}${pcArrow}</div>
                   <div style="${blockStyle} background:${ptsBg}; color:white; border-radius: 0 0 10px 0;">${displayPoints}${bonusHtml}</div>
               </div>`;
            }
            
            if (app.viewMode === 'next') {
                dotsHtml = ''; // FIX: Hide 3-game list to reduce clutter
                evtHtml = ''; 
                const nextF = fixtures[1] || { opp: '-', diff: 3 }; 
                
                // FIX: Show Single Next Opponent as Top Badge
                const textColor = nextF.diff > 3 ? 'white' : '#111';
                matchBadge = `<div class="match-status" style="background:var(--fdr-${nextF.diff}); color:${textColor}; border:none;">${nextF.opp}</div>`;

                // Calculate Projected Points (xP)
                let chance = (p.chance !== null ? p.chance : 100) / 100;
                let xP = ((parseFloat(p.form||0) * 0.5) + ((6 - nextF.diff) * 1.0)) * chance;
                if (p.is_captain) xP *= 2;

                // FIX: Match Live Card Design (Solid Flush Footer)
                const blockStyle = "flex:1; height:20px; display:flex; align-items:center; justify-content:center; font-size:0.7rem; font-weight:800;";
                
                bottomBar = `<div style="display:flex; width:100%; margin-top:2px; border-top:1px solid #f3f4f6;">
                   <div style="${blockStyle} background:#fff; color:#374151; border-radius: 0 0 0 10px;">£${p.price}${pcArrow}</div>
                   <div style="${blockStyle} background:#e0e7ff; color:#3730a3; border-radius: 0 0 10px 0;">${xP.toFixed(1)} xP</div>
               </div>`;
            }

            // --- SMART STATUS ICONS (STACKED) ---
            let stackHtml = '';
            // FIX: Only generate HTML if NOT in Live Mode (Prevents stray </div> bug)
            if (app.viewMode !== 'live' || app.isSimulating) {
                stackHtml = '<div class="status-stack">';
                
                // 1. Availability (Injury/Suspension)
                if (p.status === 'd') stackHtml += `<div class="status-icon si-warn"><i class="fa-solid fa-exclamation"></i></div>`;
                else if (['i', 's', 'n'].includes(p.status)) stackHtml += `<div class="status-icon si-bad"><i class="fa-solid fa-xmark"></i></div>`;

                // 2. Form & Diff
                const form = parseFloat(p.form);
                const sel = parseFloat(p.sel);
                if (form > 6.0) stackHtml += `<div class="status-icon si-fire"><i class="fa-solid fa-fire"></i></div>`;
                else if (form < 2.0) stackHtml += `<div class="status-icon si-cold"><i class="fa-regular fa-snowflake"></i></div>`;
                if (sel < 10.0) stackHtml += `<div class="status-icon si-gem"><i class="fa-regular fa-gem"></i></div>`;
                
                stackHtml += '</div>';
            }

            // Heatmap Border: Next GW only, ignore Captains (who have gold border)
            let pillStyle = '';
            if (app.viewMode === 'next' && !p.is_captain) {
                const nextF = fixtures[1] || { diff: 3 };
                pillStyle = `style="border-color:var(--fdr-${nextF.diff});"`;
            }

            return `<div class="player-pill ${isBench ? 'bench-pill' : ''} ${extraClass}" ${pillStyle} onclick="app.openModal(${p.id})">
                    ${isBench ? `<div class="bench-num">${benchNum}</div>` : ''} ${capBadge} ${subIcon} ${csShield} ${stackHtml} ${newBadge} ${matchBadge} ${dotsHtml} ${evtHtml}
                    <img src="${kitUrl}" class="kit-img" onerror="this.style.display='none'">
                    <div class="pill-name">${p.name}</div>
                    ${bottomBar}
                </div>`;
        },

        openModal: async (playerId) => {
            const p = app.playersCache[playerId];
            if (!p) return;
            document.body.classList.add('scroll-lock'); // Lock BG
            const overlay = document.getElementById('playerModalOverlay');
            
            const net = (p.transfers_in || 0) - (p.transfers_out || 0);
            const netClass = net >= 0 ? 't-net-pos' : 't-net-neg';
            const netStr = (Math.abs(net) > 999) ? (net/1000).toFixed(1) + 'k' : net;
            const pc = p.cost_change > 0 ? '<span class="pc-arrow pc-up">▲</span>' : (p.cost_change < 0 ? '<span class="pc-arrow pc-down">▼</span>' : '');

            // FIX: Show User Pricing Logic (PP/SP) for Debugging
            const myPick = app.currentPicks.find(px => px.element === p.id);
            let priceInfo = `<span style="font-weight:700">£${p.price}m</span>${pc}`;
            
            if (myPick && typeof myPick.selling_price === 'number') {
                priceInfo += `<div style="font-size:0.7rem; color:#666; margin-top:4px; font-weight:500;">
                    Paid: £${(myPick.purchase_price).toFixed(1)}m | Sell: <span style="color:var(--primary); font-weight:800;">£${(myPick.selling_price).toFixed(1)}m</span>
                </div>`;
            }

            const kitUrl = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.team_code}-66.png`;
            const headerHtml = `
                <div style="display:flex; align-items:center; gap:15px;">
                    <img src="${kitUrl}" style="width:50px; height:64px; object-fit:contain; filter:drop-shadow(0 4px 6px rgba(0,0,0,0.2));">
                    <div>
                        <div class="m-player-name">${p.name}</div>
                        <div class="m-player-team">${p.team} • ${priceInfo}</div>
                    </div>
                </div>`;
            
            // Target the first child div of modal-header to replace default text
            document.querySelector('#playerModalOverlay .modal-header > div').innerHTML = headerHtml;
            
            const fVal = parseFloat(p.form);
            const fColor = fVal > 6.0 ? '#16a34a' : (fVal < 2.0 ? '#ef4444' : 'var(--primary)');
            document.getElementById('modalForm').innerHTML = `<span style="color:${fColor}">${p.form}</span>`;

            const sVal = parseFloat(p.sel);
            const sColor = sVal < 10 ? '#8b5cf6' : (sVal > 40 ? '#ef4444' : 'var(--primary)');
            document.getElementById('modalSel').innerHTML = `<span style="color:${sColor}">${p.sel}%</span>`;
            
            // Smart Stats: Show xP if planning (Transfer/Next), Points if Live
            const isLive = app.currentTool === 'squad' && app.viewMode === 'live';
            const ptsLabel = document.getElementById('modalPts').parentElement.querySelector('.m-stat-label');
            
            if (isLive) {
                ptsLabel.innerText = "GW Points";
                document.getElementById('modalPts').innerText = p.event_points;
                document.getElementById('modalPts').style.color = 'var(--primary)';
            } else {
                const nextF = (app.fixMap[p.team_id] || [])[1] || { diff: 3 };
                
                let chance = (p.chance !== null ? p.chance : 100) / 100;
                let xP = ((parseFloat(p.form||0) * 0.5) + ((6 - nextF.diff) * 1.0)) * chance;

                ptsLabel.innerText = "xP (Next)";
                document.getElementById('modalPts').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" style="font-size:0.8rem; margin-right:4px;"></i>${xP.toFixed(1)}`;
                document.getElementById('modalPts').style.color = '#e90052';
            }

            const newsEl = document.getElementById('modalNews');
            if (p.news) { newsEl.style.display = 'block'; newsEl.innerText = p.news; } else { newsEl.style.display = 'none'; }

            const actionContainer = document.getElementById('modalActions');
            const isOwned = app.currentPicks.some(pick => pick.element == p.id);
            if (isOwned) {
                actionContainer.innerHTML = `<div style="text-align:center; color:#888; font-size:0.8rem;">You own this player</div>`;
            } else {
                actionContainer.innerHTML = `<button class="action-btn btn-buy" onclick="app.showReplacements(${p.id}, ${p.pos})"><i class="fa-solid fa-arrow-right-arrow-left"></i> Transfer In</button><div id="repList_${p.id}" class="rep-list"></div>`;
            }

            overlay.classList.add('open');

            // Cache Check
            if (app.fixtureCache[playerId]) {
                document.getElementById('modalFixtures').innerHTML = app.fixtureCache[playerId];
                return;
            }

            // Skeleton Loader for Modal
            document.getElementById('modalFixtures').innerHTML = `
                <div class="fix-list" style="overflow:hidden; gap:8px;">
                    ${Array(3).fill('<div class="fix-box skeleton" style="height:50px; border:none;"></div>').join('')}
                </div>`;
            try {
                const data = await app.fetchUrl(`https://fantasy.premierleague.com/api/element-summary/${playerId}/`);
                let html = '';

                // History (Last 3 Games)
                if (data.history) {
                    data.history.slice(-3).forEach(h => {
                        const opp = app.teams ? app.teams[h.opponent_team] : '-';
                        html += `<div class="fix-box" style="opacity:0.6;"><div class="fix-gw-label">GW${h.round}</div><div class="fix-opp-pill" style="background:#f3f4f6; color:#4b5563;"><div>${opp} <span style="font-size:0.6rem; font-weight:400;">${h.was_home?'(H)':'(A)'}</span></div><div class="fix-loc" style="font-weight:800; color:${h.total_points>=6?'#16a34a':'#4b5563'}">${h.total_points}pts</div></div></div>`;
                    });
                }
                
                data.fixtures.slice(0, 5).forEach(f => {
                    const isHome = f.is_home;
                    const oppName = app.teams ? app.teams[isHome ? f.team_a : f.team_h] : '---';
                    const diffClass = `d-${f.difficulty}`;
                    
                    html += `
                        <div class="fix-box">
                            <div class="fix-gw-label">GW${f.event}</div>
                            <div class="fix-opp-pill ${diffClass}">
                                <div>${oppName}</div>
                                <div class="fix-loc">${isHome ? '(H)' : '(A)'}</div>
                            </div>
                        </div>
                    `;
                });
                app.fixtureCache[playerId] = html;
                document.getElementById('modalFixtures').innerHTML = html;
            } catch (e) { document.getElementById('modalFixtures').innerHTML = '<div style="color:red; font-size:0.8rem;">Could not load fixtures.</div>'; }
        },

        showReplacements: (buyId, buyPos) => {
            // ... (existing code)
        },

        openLeagues: async () => {
            document.body.classList.add('scroll-lock'); // Lock BG
            const id = localStorage.getItem('fpl_id_final') || document.getElementById('teamID').value;
            if (!id) return alert("Please log in first.");
            if (!app.userData) {
                try { app.userData = await app.fetchUrl(`https://fantasy.premierleague.com/api/entry/${id}/`); } 
                catch (e) { return alert("Could not load leagues. Check network."); }
            }
            if (!app.userData.leagues) return alert("No league data found.");
            const leagues = app.userData.leagues.classic;
            const container = document.getElementById('leaguesList');
            let html = '';
            if (leagues.length === 0) {
                html = '<div style="text-align:center; padding:20px; color:#888;">No Classic Leagues found.</div>';
            } else {
                leagues.forEach(lg => {
                    let arrow = lg.entry_rank < lg.entry_last_rank ? '<i class="fa-solid fa-arrow-up arrow-up" style="font-size:0.8rem"></i>' : (lg.entry_rank > lg.entry_last_rank ? '<i class="fa-solid fa-arrow-down arrow-down" style="font-size:0.8rem"></i>' : '<i class="fa-solid fa-minus arrow-same" style="font-size:0.8rem"></i>');
                    // Pro Card Layout
                    html += `
                    <div class="league-item">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <div style="background:#e0e7ff; color:#3730a3; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.8rem;">${lg.entry_rank <= 5 ? '<i class="fa-solid fa-trophy"></i>' : '#'}</div>
                            <div class="lg-name">${lg.name}</div>
                        </div>
                        <div class="lg-rank-box">
                            <div class="lg-rank">${lg.entry_rank.toLocaleString()}</div>
                            <div style="font-size:0.65rem; color:#888; margin-top:2px;">${arrow} Prev: ${lg.entry_last_rank.toLocaleString()}</div>
                        </div>
                    </div>`;
                });
            }
            container.innerHTML = html;
            document.getElementById('leaguesModalOverlay').classList.add('open');
        },
        closeModal: () => { 
            document.getElementById('playerModalOverlay').classList.remove('open');
            document.body.classList.remove('scroll-lock'); // Unlock BG
        }
    };

    // =========================================
    // 3. GLOBAL HELPERS & EVENTS
    // =========================================
    function toggleMenu() { app.toggleMenu(); }
    function switchTool(t) { app.switchTool(t); }
    
    function clearData() { 
        const isLogged = !!localStorage.getItem('fpl_id_final');
        const title = document.getElementById('lgTitle');
        const msg = document.getElementById('lgMsg');
        const btn = document.getElementById('lgConfirm');
        
        if (isLogged) {
            title.innerText = "Log Out?";
            msg.innerText = "Are you sure you want to disconnect your team?";
            btn.style.display = 'block';
        } else {
            title.innerText = "Guest Mode";
            msg.innerText = "You are not connected. Please enter your Team ID on the home screen.";
            btn.style.display = 'none';
        }
        document.getElementById('logoutOverlay').classList.add('open');
        // Sidebar toggle removed
    }

    function closeLogout() { document.getElementById('logoutOverlay').classList.remove('open'); }
    function confirmLogout() { localStorage.removeItem('fpl_id_final'); location.reload(); }

    function closeModal() { app.closeModal(); }
    
    // Fix: Handle Browser Back Button
    window.onpopstate = (event) => {
        if (event.state && event.state.tool) {
            app.switchTool(event.state.tool, true, true); // suppressMenu=true, fromHistory=true
        }
    };

    document.getElementById('playerModalOverlay').addEventListener('click', (e) => { 
        if (e.target.id === 'playerModalOverlay') closeModal();
    });
    
    document.addEventListener('DOMContentLoaded', app.init);