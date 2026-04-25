import pandas as pd
import requests
import json
import os
import time
import base64
from datetime import datetime

# --- CONFIGURATION ---
GAS_URL = "YOUR_GAS_WEBAPP_URL_HERE" # เปลี่ยนเป็น URL ของคุณ
CSV_DIRECTORY = "./import_data"      # โฟลเดอร์ที่เก็บไฟล์ CSV
BATCH_SIZE = 50                      # จำนวนรายการต่อการส่ง 1 ครั้ง (แนะนำ 50-100)
# ---------------------

def import_csv_to_gas():
    if not os.path.exists(CSV_DIRECTORY):
        os.makedirs(CSV_DIRECTORY)
        print(f"Created directory {CSV_DIRECTORY}. Please put your CSV files there and run again.")
        return

    csv_files = [f for f in os.listdir(CSV_DIRECTORY) if f.endswith('.csv')]
    if not csv_files:
        print(f"No CSV files found in {CSV_DIRECTORY}")
        return

    print(f"Found {len(csv_files)} files to import.")

    for file_name in csv_files:
        file_path = os.path.join(CSV_DIRECTORY, file_name)
        print(f"\nProcessing {file_name}...")
        
        try:
            # Read CSV with flexible encoding
            try:
                df = pd.read_csv(file_path, encoding='utf-8-sig')
            except:
                df = pd.read_csv(file_path, encoding='tis-620')
            
            # Fill NaN with empty string
            df = df.fillna('')
            
            tasks = df.to_dict('records')
            total_tasks = len(tasks)
            print(f"Total tasks in file: {total_tasks}")

            for i in range(0, total_tasks, BATCH_SIZE):
                batch = tasks[i:i + BATCH_SIZE]
                
                # Format data to match Code.gs expectations
                formatted_batch = []
                for t in batch:
                    # Parse CustomFields if it's a string in CSV
                    custom_fields = t.get('CustomFields', '{}')
                    if isinstance(custom_fields, str) and custom_fields.strip().startswith('{'):
                        try:
                            custom_fields = json.loads(custom_fields)
                        except:
                            pass
                    
                    formatted_batch.append({
                        **t,
                        'CustomFields': custom_fields
                    })

                payload = {
                    "action": "batchAddTasks",
                    "data": formatted_batch,
                    "executorId": "ImportScript"
                }

                print(f"Sending batch {i//BATCH_SIZE + 1} ({len(batch)} tasks)...", end='', flush=True)
                
                response = requests.post(GAS_URL, json=payload)
                result = response.json()

                if result.get('status') == 'success':
                    print(" ✅ Success")
                else:
                    print(f" ❌ Error: {result.get('message')}")
                
                # Small delay to prevent hitting GAS limits too hard
                time.sleep(1)

        except Exception as e:
            print(f"Error processing {file_name}: {e}")

if __name__ == "__main__":
    if GAS_URL == "YOUR_GAS_WEBAPP_URL_HERE":
        print("Please set your GAS_URL in the script first!")
    else:
        import_csv_to_gas()
