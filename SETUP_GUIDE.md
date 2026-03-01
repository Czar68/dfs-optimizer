# Production Betting Operations - Setup Guide

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Main project dependencies
npm install

# Dashboard dependencies (optional, for web interface)
cd dashboard
npm install
cd ..
```

### 2. Configure Environment

```bash
# Set your bankroll and risk parameters
export CURRENT_BANKROLL=750
export MAX_KELLY_FRACTION=0.5
export DAILY_RISK_CAP=0.10
```

### 3. Run Daily Betting Operations

```powershell
# Basic daily run
.\scripts\daily_betting_run.ps1

# With custom parameters
.\scripts\daily_betting_run.ps1 -Bankroll 750 -MaxKellyFraction 0.5 -DailyRiskCap 0.10
```

### 4. Start Web Dashboard (Optional)

```bash
cd dashboard
npm run dev
# Navigate to http://localhost:3000
```

---

## 📋 System Overview

### **Core Components**

1. **Daily Runner Script** (`scripts/daily_betting_run.ps1`)
   - Orchestrates all optimizers
   - Applies correlation filters
   - Computes Kelly stakes
   - Pushes to Sheets and dashboard

2. **Correlation Filters** (`src/correlation_filters.ts`)
   - Removes same-player conflicts
   - Enforces team concentration limits
   - Validates structure constraints

3. **Kelly Stake Sizing** (`src/kelly_stake_sizing.ts`)
   - Sport and structure weighting
   - Portfolio risk management
   - Automatic scaling for risk caps

4. **Web Dashboard** (`dashboard/`)
   - Real-time recommendations
   - Advanced filtering
   - Risk visualization

5. **Logging Infrastructure** (`src/logger.ts`)
   - Comprehensive metrics tracking
   - Daily performance logs
   - Error monitoring

---

## ⚙️ Configuration

### **Bankroll Management**

Edit `src/kelly_stake_sizing.ts` to customize:

```typescript
const DEFAULT_BANKROLL_CONFIG = {
  currentBankroll: 750,        // Your current bankroll
  maxDailyRisk: 0.10,          // 10% daily risk cap
  maxKellyMultiplier: 0.5,     // 50% of Kelly globally
  sportWeights: {
    'NBA': 1.0,               // Full Kelly for NBA
    'NHL': 0.5,               // 50% Kelly for NHL
    // ... other sports
  },
  structureWeights: {
    '2P': 0.25,               // Very conservative
    '5F': 1.0,                // Full Kelly for main structures
    // ... other structures
  },
};
```

### **Correlation Filters**

Edit `src/correlation_filters.ts` to customize:

```typescript
const DEFAULT_CORRELATION_CONFIG = {
  maxPlayersPerTeam: {
    'NBA': 3,                 // Max 3 players per team
    'NHL': 2,                 // Max 2 players per team
  },
  allowSamePlayerOpposites: false,  // No over/under on same player
  correlationThreshold: 0.10,       // 10% combined EV minimum
};
```

---

## 📊 Daily Workflow

### **1. Morning Setup**
```bash
# Update bankroll if needed
export CURRENT_BANKROLL=800

# Run daily script
.\scripts\daily_betting_run.ps1
```

### **2. Review Results**
- Check console output for summary
- Review `logs/daily_run_*.log` for details
- Open dashboard for visual analysis

### **3. Place Bets**
- Use dashboard as primary interface
- Verify stake sizes and risk allocation
- Monitor total bankroll exposure

### **4. End-of-Day Review**
- Review `logs/metrics_*.json` for performance
- Update bankroll based on results
- Adjust parameters if needed

---

## 🔧 Troubleshooting

### **Common Issues**

**TypeScript Compilation Errors**
```bash
# Reinstall dependencies
npm install

# Clean and rebuild
rm -rf dist
npx tsc -p .
```

**Dashboard Dependencies**
```bash
cd dashboard
npm install lucide-react react react-dom next typescript
npm run dev
```

**Sheets Integration Issues**
- Check Python scripts exist: `sheets_push_cards.py`, `sheets_push_underdog_legs.py`, `sheets_push_singles.py`
- Verify Sheets API credentials
- Check file permissions

**Optimizer Failures**
- Check internet connection for data fetching
- Verify PrizePicks/Underdog APIs are accessible
- Review error logs in `logs/` directory

### **Performance Optimization**

**Large Data Sets**
- Increase memory: `export NODE_OPTIONS="--max-old-space-size=4096"`
- Use correlation filters to reduce card count
- Adjust EV thresholds for stricter filtering

**Dashboard Performance**
- Enable caching in Next.js config
- Use pagination for large card sets
- Optimize filter queries

---

## 📈 Monitoring & Metrics

### **Key Metrics to Track**

1. **Card Generation**
   - Cards per structure type
   - Average EV per structure
   - Success rate by optimizer

2. **Risk Management**
   - Daily stake vs bankroll percentage
   - Scaling frequency
   - Risk level distribution

3. **Performance**
   - Total EV generated
   - Kelly allocation efficiency
   - Correlation filter impact

### **Alert Thresholds**

- **Risk Level**: Alert when >15% of bankroll
- **Scaling**: Alert when scaling applied >2 days in a row
- **Card Count**: Alert when <5 cards generated total
- **EV Threshold**: Alert when average EV <3%

---

## 🎯 Best Practices

### **Bankroll Management**
- Start with conservative Kelly fractions (25-50%)
- Never exceed 10% daily risk cap
- Update bankroll daily for accurate sizing

### **Quality Control**
- Keep correlation filters enabled
- Monitor same-player conflict frequency
- Review team concentration adjustments

### **Operational Discipline**
- Run daily script at consistent time
- Review dashboard before placing bets
- Track performance metrics weekly

### **Continuous Improvement**
- Adjust sport weights based on performance
- Tune correlation thresholds for your risk tolerance
- Monitor and optimize structure targets

---

## 📞 Support

### **Log Files**
- Daily run: `logs/daily_run_YYYY-MM-DD_HHMMSS.log`
- Metrics: `logs/metrics_YYYY-MM-DD.json`
- Dashboard data: `dist/dashboard_data.json`

### **Key Files to Modify**
- Bankroll config: `src/kelly_stake_sizing.ts`
- Correlation filters: `src/correlation_filters.ts`
- Daily runner: `scripts/daily_betting_run.ps1`
- Dashboard: `dashboard/` directory

### **Getting Help**
1. Check log files for error details
2. Verify all dependencies are installed
3. Review configuration parameters
4. Test individual components separately

---

## 🚀 Production Deployment

### **Automation**
- Set up cron job for daily script
- Configure monitoring for failures
- Implement backup procedures

### **Scaling**
- Consider cloud hosting for dashboard
- Implement database for metrics storage
- Add alerting system for notifications

### **Security**
- Secure API credentials
- Implement access controls for dashboard
- Regular backup of configuration files

---

**Ready for production betting operations!** 🎯

The system is now configured for disciplined, data-driven betting with comprehensive risk management and real-time oversight.
