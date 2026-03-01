@echo off
cd /d "C:\Users\Media-Czar Desktop\Dev\dfs-optimizer"

echo "=== 6-SPORT PRODUCTION PIPELINE ==="
echo "Time: %date% %time%"
echo.

echo "=== NBA (Live Season) ==="
node dist/run_optimizer.js --sports NBA --refresh-interval-minutes=1
echo.

echo "=== NCAAB (Live Tonight) ==="
node dist/run_optimizer.js --sports NCAAB --refresh-interval-minutes=1
echo.

echo "=== NHL (Seasonal) ==="
node dist/run_optimizer.js --sports NHL --refresh-interval-minutes=1
echo.

echo "=== NFL (Offseason) ==="
node dist/run_optimizer.js --sports NFL --refresh-interval-minutes=1
echo.

echo "=== MLB (Offseason) ==="
node dist/run_optimizer.js --sports MLB --refresh-interval-minutes=1
echo.

echo "=== NCAAF (Offseason) ==="
node dist/run_optimizer.js --sports NCAAF --refresh-interval-minutes=1
echo.

echo "=== Dashboard Update ==="
copy underdog-cards.csv web-dashboard\public\data\ /Y
copy prizepicks-cards.csv web-dashboard\public\data\ /Y
echo "✅ Dashboard data updated"
echo.

echo "=== Google Sheets Push ==="
python sheets_push_legs.py
python sheets_push_underdog_legs.py  
python sheets_push_cards.py
echo "✅ Sheets updated"
echo.

echo "=== Quota Status ==="
type .cache\provider-usage.json
echo.

echo "=== Production Complete ==="
echo "Dashboard: http://localhost:5173"
echo "Filter: All | NBA | NCAAB | NHL | NFL | MLB | NCAAF"
echo "Kelly: 15%% max per sport"
echo.

pause
