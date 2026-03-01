#!/usr/bin/env python3
"""
Telegram Kelly Alerts - Sends notifications for high Kelly stake opportunities
"""

import requests
import pandas as pd
import json
import os
from datetime import datetime

class TelegramKellyAlerts:
    def __init__(self):
        # Load configuration from environment or .env file
        self.bot_token = os.getenv('TELEGRAM_BOT_TOKEN', 'YOUR_BOT_TOKEN')
        self.chat_id = os.getenv('TELEGRAM_CHAT_ID', 'YOUR_CHAT_ID')
        self.base_url = f"https://api.telegram.org/bot{self.bot_token}"
        
        # Kelly threshold (5% of $1000 bankroll = $50)
        self.kelly_threshold = 50.0
        
        # Data files
        self.underdog_file = "underdog-cards.csv"
        self.prizepicks_file = "prizepicks-cards.csv"
        
    def load_cards(self):
        """Load cards from CSV files"""
        cards = []
        
        try:
            # Load Underdog cards
            if os.path.exists(self.underdog_file):
                df_ud = pd.read_csv(self.underdog_file)
                df_ud['site'] = 'Underdog'
                cards.append(df_ud)
                
            # Load PrizePicks cards  
            if os.path.exists(self.prizepicks_file):
                df_pp = pd.read_csv(self.prizepicks_file)
                df_pp['site'] = 'PrizePicks'
                cards.append(df_pp)
                
        except Exception as e:
            print(f"Error loading CSV files: {e}")
            return pd.DataFrame()
            
        if cards:
            return pd.concat(cards, ignore_index=True)
        return pd.DataFrame()
    
    def filter_high_kelly(self, df):
        """Filter cards with Kelly stakes above threshold"""
        if df.empty or 'kellyStake' not in df.columns:
            return pd.DataFrame()
            
        # Convert kellyStake to numeric if it's not already
        df['kellyStake'] = pd.to_numeric(df['kellyStake'], errors='coerce')
        
        # Filter high Kelly opportunities
        high_kelly = df[df['kellyStake'] > self.kelly_threshold].copy()
        
        # Sort by Kelly stake (highest first)
        high_kelly = high_kelly.sort_values('kellyStake', ascending=False)
        
        return high_kelly
    
    def format_alert_message(self, card):
        """Format a single card as Telegram message"""
        try:
            sport = card.get('sport', 'Unknown')
            kelly_stake = card.get('kellyStake', 0)
            card_ev = card.get('cardEv', 0) * 100  # Convert to percentage
            site = card.get('site', 'Unknown')
            kelly_frac = card.get('kellyFrac', 'N/A')
            
            # Get leg info
            legs = []
            for i in range(1, 7):  # Check leg1Id through leg6Id
                leg_id = card.get(f'leg{i}Id')
                if leg_id and pd.notna(leg_id):
                    legs.append(str(leg_id))
            
            leg_info = '-'.join(legs[:3]) if legs else 'N/A'
            
            emoji = "🚨" if kelly_stake > 100 else "⚡"
            
            message = f"""
{emoji} HIGH KELLY ALERT

🏀 Sport: {sport}
💰 Kelly: ${kelly_stake:.2f} ({kelly_frac})
📈 EV: {card_ev:.1f}%
🎯 Site: {site}
🎲 Legs: {leg_info}

⏰ {datetime.now().strftime('%I:%M %p')}
            """.strip()
            
            return message
            
        except Exception as e:
            print(f"Error formatting message: {e}")
            return f"🚨 High Kelly Alert - Error formatting card data"
    
    def send_message(self, message):
        """Send message to Telegram"""
        try:
            payload = {
                'chat_id': self.chat_id,
                'text': message,
                'parse_mode': 'HTML'
            }
            
            response = requests.post(f"{self.base_url}/sendMessage", data=payload)
            
            if response.status_code == 200:
                print(f"✅ Message sent successfully")
                return True
            else:
                print(f"❌ Failed to send message: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error sending message: {e}")
            return False
    
    def send_alerts(self):
        """Main function to check and send alerts"""
        print(f"🔍 Checking for high Kelly opportunities at {datetime.now().strftime('%I:%M %p')}")
        
        # Load cards
        df = self.load_cards()
        if df.empty:
            print("❌ No cards data found")
            return
        
        # Filter high Kelly cards
        high_kelly = self.filter_high_kelly(df)
        
        if high_kelly.empty:
            print(f"✅ No high Kelly opportunities found (threshold: ${self.kelly_threshold})")
            return
        
        print(f"🚨 Found {len(high_kelly)} high Kelly opportunities")
        
        # Send summary message
        summary = f"""
📊 KELLY ALERTS SUMMARY

Found {len(high_kelly)} cards with Kelly > ${self.kelly_threshold}

Top 3 opportunities:
"""
        
        # Add top 3 cards to summary
        for i, (_, card) in enumerate(high_kelly.head(3).iterrows()):
            sport = card.get('sport', 'Unknown')
            kelly = card.get('kellyStake', 0)
            ev = card.get('cardEv', 0) * 100
            summary += f"{i+1}. {sport}: ${kelly:.2f} ({ev:.1f}% EV)\n"
        
        summary += f"\n⏰ {datetime.now().strftime('%I:%M %p')}"
        
        self.send_message(summary)
        
        # Send individual alerts for very high Kelly (> $100)
        very_high_kelly = high_kelly[high_kelly['kellyStake'] > 100]
        
        if not very_high_kelly.empty:
            print(f"🚨 Sending {len(very_high_kelly)} individual alerts for very high Kelly")
            
            for _, card in very_high_kelly.iterrows():
                message = self.format_alert_message(card)
                self.send_message(message)
                
                # Small delay between messages to avoid spamming
                import time
                time.sleep(1)
    
    def test_connection(self):
        """Test Telegram bot connection"""
        test_message = f"""
🤖 Telegram Kelly Bot Test

✅ Bot is online and ready!
🔔 High Kelly threshold: ${self.kelly_threshold}
📊 Monitoring: underdog-cards.csv, prizepicks-cards.csv
⏰ Test time: {datetime.now().strftime('%I:%M %p')}

Ready for tonight's NCAAB games! 🏀
        """.strip()
        
        return self.send_message(test_message)


def main():
    """Main execution"""
    alerts = TelegramKellyAlerts()
    
    # Check if bot token and chat ID are configured
    if alerts.bot_token == 'YOUR_BOT_TOKEN' or alerts.chat_id == 'YOUR_CHAT_ID':
        print("❌ Please configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables")
        print("   or set them in your .env file")
        print("\n📝 Setup Instructions:")
        print("1. Create a Telegram bot with @BotFather")
        print("2. Get your bot token")
        print("3. Get your chat ID (send a message to your bot and check updates)")
        print("4. Set environment variables:")
        print("   export TELEGRAM_BOT_TOKEN='your_bot_token'")
        print("   export TELEGRAM_CHAT_ID='your_chat_id'")
        return
    
    # Test connection
    print("🔧 Testing Telegram connection...")
    if alerts.test_connection():
        print("✅ Telegram connection successful")
        
        # Send alerts
        alerts.send_alerts()
    else:
        print("❌ Telegram connection failed")


if __name__ == "__main__":
    main()
