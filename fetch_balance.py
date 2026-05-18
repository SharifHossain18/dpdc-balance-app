import sys
import json
import os
from datetime import datetime
from dpdc import DpdcPrepaid

METER_NUMBERS = ['30063197', '32405143']

def fetch_balance():
    all_data = []
    
    for meter in METER_NUMBERS:
        if meter == 'ENTER_SECOND_METER_HERE':
            continue
            
        try:
            print(f"Fetching balance for meter: {meter}")
            client = DpdcPrepaid(meter)
            result = client.get_balance()
            
            data = dict(result)
            
            output = {
                "meterNumber": meter,
                "accountId": data.get("accountId", ""),
                "accountType": data.get("accountType", ""),
                "balanceRemaining": float(data.get("balanceRemaining", 0)),
                "connectionStatus": data.get("connectionStatus", "Unknown"),
                "lastUpdated": datetime.now().isoformat()
            }
            all_data.append(output)
            
        except Exception as e:
            print(f"Error fetching balance for {meter}: {e}")
            # Do not exit, continue with next meter
    
    os.makedirs('api', exist_ok=True)
    with open('api/balance.json', 'w') as f:
        json.dump(all_data, f, indent=4)
        
    # Handle history
    history_file = 'api/history.json'
    history_data = {}
    if os.path.exists(history_file):
        try:
            with open(history_file, 'r') as f:
                history_data = json.load(f)
        except:
            pass
            
    for item in all_data:
        meter = item["meterNumber"]
        if meter not in history_data:
            history_data[meter] = []
        
        # Append new reading
        history_data[meter].append({
            "time": datetime.now().strftime("%b %d, %H:%M"),
            "balance": item["balanceRemaining"]
        })
        
        # Keep only the last 48 readings (48 hours if run hourly)
        if len(history_data[meter]) > 48:
            history_data[meter] = history_data[meter][-48:]
            
    with open(history_file, 'w') as f:
        json.dump(history_data, f, indent=4)
        
    print("Successfully updated api/balance.json and api/history.json")
    print(json.dumps(all_data, indent=2))

if __name__ == "__main__":
    fetch_balance()
