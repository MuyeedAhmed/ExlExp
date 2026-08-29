import openpyxl
import json
import os
import datetime
import random

# File paths
EXCEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Bank Log.xlsx')
DB_JSON_PATH = '/Users/muyeedahmed/Desktop/Gitcode/ExlExp/db.json'

# Default Categories
CATEGORIES = [
    { "id": "cat-food", "name": "Food & Dining" },
    { "id": "cat-groceries", "name": "Groceries" },
    { "id": "cat-transport", "name": "Transportation" },
    { "id": "cat-utilities", "name": "Rent & Utilities" },
    { "id": "cat-shopping", "name": "Shopping" },
    { "id": "cat-entertainment", "name": "Entertainment" },
    { "id": "cat-others", "name": "Others" }
]

def guess_category(merchant_name):
    m = str(merchant_name).lower()
    
    import re
    words = set(re.findall(r'\b\w+\b', m))
    
    # Food & Dining keywords
    food_words = {'starbucks', 'bakery', 'gonbei', 'sweets', 'cafe', 'restaurant', 'food', 'dining', 'tasty', 'pizza', 'burger', 'grill', 'kitchen', 'eats', 'dunkin', 'umacha', 'mochi', 'pub', 'diner', 'sushi', 'deli', 'subway'}
    food_substrings = ['tous les jours', 'dining']
    if words.intersection(food_words) or any(s in m for s in food_substrings):
        return 'Food & Dining'
        
    # Groceries keywords
    groceries_words = {'mitsuwa', 'walmart', 'costco', 'grocery', 'groceries', 'market', 'supermarket', 'shoprite', 'aldi'}
    groceries_substrings = ['h mart', 'trader joe', 'whole foods', 'target grocery']
    if words.intersection(groceries_words) or any(s in m for s in groceries_substrings):
        return 'Groceries'
        
    # Transportation keywords
    transport_words = {'gas', 'wawa', 'uber', 'lyft', 'transport', 'transit', 'train', 'flight', 'airline', 'toll', 'parking', 'auto', 'car', 'repair', 'mvc', 'license'}
    transport_substrings = ['nj mvc']
    if words.intersection(transport_words) or any(s in m for s in transport_substrings):
        return 'Transportation'
        
    # Rent & Utilities keywords
    utilities_words = {'rent', 'utility', 'utilities', 'power', 'electric', 'water', 'internet', 'comcast', 'verizon', 'phone', 'cellphone', 'optimum', 'insurance'}
    utilities_substrings = ['t-mobile', 'us mobile', 'h2o']
    if words.intersection(utilities_words) or any(s in m for s in utilities_substrings):
        return 'Rent & Utilities'
        
    # Shopping keywords
    shopping_words = {'amazon', 'shopping', 'target', 'ebay', 'clothing', 'shoes', 'mall', 'store', 'hardware', 'ikea'}
    shopping_substrings = ['ups store', 'best buy', 'home depot']
    if words.intersection(shopping_words) or any(s in m for s in shopping_substrings):
        return 'Shopping'
        
    # Entertainment keywords
    entertainment_words = {'netflix', 'hulu', 'cinema', 'movie', 'entertainment', 'spotify', 'game', 'gaming', 'steam', 'playstation', 'xbox', 'disney', 'ticketmaster'}
    entertainment_substrings = ['suno ai']
    if words.intersection(entertainment_words) or any(s in m for s in entertainment_substrings):
        return 'Entertainment'
        
    return 'Others'

def generate_id(prefix=""):
    chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    rand = "".join(random.choice(chars) for _ in range(9))
    return f"{prefix}{rand}"

def main():
    if not os.path.exists(EXCEL_PATH):
        print(f"Error: {EXCEL_PATH} not found.")
        return

    print("Loading workbook (reading evaluated data)...")
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    
    # 1. Parse Cards from CredCard sheet
    cards = []
    card_name_to_id = {}
    
    # Add default cards
    default_cards_map = {
        'Citi DB': { 'id': 'card-citidb', 'name': 'Citi Double Cash', 'lastFour': '5555', 'sheet': 'CitiDb' },
        'Citi Strata': { 'id': 'card-citistrata', 'name': 'Citi Strata', 'lastFour': '1234', 'sheet': 'CitiSrt' },
        'BofA - Premium': { 'id': 'card-bofa', 'name': 'BofA Premium', 'lastFour': '9876', 'sheet': 'BoA' },
        'Chase Bank': { 'id': 'card-chase', 'name': 'Chase Checking', 'lastFour': '0000', 'sheet': 'Chase' }
    }
    
    # Let's inspect CredCard sheet
    if 'CredCard' in wb.sheetnames:
        cred_card_sheet = wb['CredCard']
        rows = list(cred_card_sheet.iter_rows(values_only=True))
        
        # Row 2 contains headers: (None, 'Cards', 'Returned', 'Balance', 'Fee', 'Reward', 'Since', 'Age', 'Limit')
        # Row 3 onwards are cards
        for row in rows[2:]:
            if len(row) > 1 and row[1] is not None:
                card_key = row[1].strip()
                if card_key in default_cards_map:
                    card_def = default_cards_map[card_key]
                    cards.append({
                        "id": card_def['id'],
                        "name": card_def['name'],
                        "lastFour": card_def['lastFour']
                    })
                    card_name_to_id[card_key] = card_def['id']
                    print(f"Registered card from Excel: {card_def['name']} (ID: {card_def['id']})")
                else:
                    # Dynamically register card if not in defaults
                    c_id = f"card-{card_key.lower().replace(' ', '')}"
                    cards.append({
                        "id": c_id,
                        "name": card_key,
                        "lastFour": "----"
                    })
                    card_name_to_id[card_key] = c_id
                    print(f"Registered dynamic card: {card_key} (ID: {c_id})")

    # Add Chase card if not already added
    if 'Chase Bank' not in card_name_to_id:
        card_def = default_cards_map['Chase Bank']
        cards.append({
            "id": card_def['id'],
            "name": card_def['name'],
            "lastFour": card_def['lastFour']
        })
        card_name_to_id['Chase Bank'] = card_def['id']
        print(f"Registered default Chase Checking (ID: {card_def['id']})")

    expenses = []
    
    # 2. Helper to parse credit card sheet rows
    def parse_card_sheet(sheet_name, card_id):
        if sheet_name not in wb.sheetnames:
            print(f"Sheet {sheet_name} not found in workbook. Skipping.")
            return
            
        sheet = wb[sheet_name]
        print(f"Parsing sheet: {sheet_name} for card {card_id}...")
        
        # Scan for header row containing 'Date', 'To', 'Spend'
        header_row_idx = -1
        rows = list(sheet.iter_rows(values_only=True))
        
        col_indices = {}
        for r_idx, row in enumerate(rows):
            # check if row contains header indicators
            row_str = [str(x).lower().strip() if x is not None else "" for x in row]
            if 'date' in row_str and ('to' in row_str or 'from' in row_str) and ('spend' in row_str or 'withdraw' in row_str):
                header_row_idx = r_idx
                # map columns
                for c_idx, val in enumerate(row_str):
                    if val == 'date' and 'date' not in col_indices:
                        col_indices['date'] = c_idx
                    elif val in ['to', 'from'] and 'to' not in col_indices:
                        col_indices['to'] = c_idx
                    elif val in ['return', 'salary', 'deposit'] and 'return' not in col_indices:
                        col_indices['return'] = c_idx
                    elif val in ['spend', 'withdraw'] and 'spend' not in col_indices:
                        col_indices['spend'] = c_idx
                break
                
        if header_row_idx == -1:
            print(f"Warning: Could not find header row for sheet {sheet_name}. Skipping.")
            return
            
        print(f"Found headers at row {header_row_idx + 1}: {col_indices}")
        
        current_date = None
        count = 0
        
        for r_idx, row in enumerate(rows[header_row_idx + 1:]):
            # 1. Date extraction
            date_cell = row[col_indices['date']] if 'date' in col_indices and col_indices['date'] < len(row) else None
            if date_cell is not None:
                if isinstance(date_cell, (datetime.datetime, datetime.date)):
                    current_date = date_cell.strftime('%Y-%m-%d')
                else:
                    # try parsing string
                    date_str = str(date_cell).strip()
                    try:
                        # try standard YYYY-MM-DD
                        dt = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                        current_date = dt.strftime('%Y-%m-%d')
                    except ValueError:
                        # Try parsing common excel string date or just ignore
                        pass
            
            # If we don't have a date yet, we can't register the transaction
            if current_date is None:
                continue
                
            # 2. Merchant description
            to_cell = row[col_indices['to']] if 'to' in col_indices and col_indices['to'] < len(row) else None
            if to_cell is None:
                continue
            merchant = str(to_cell).strip()
            if not merchant or merchant.isdigit():
                # Skip year rows or header separators
                continue
                
            # 3. Spend / Withdraw amount
            spend_cell = row[col_indices['spend']] if 'spend' in col_indices and col_indices['spend'] < len(row) else None
            return_cell = row[col_indices['return']] if 'return' in col_indices and col_indices['return'] < len(row) else None
            
            amount = 0.0
            is_valid = False
            
            if spend_cell is not None:
                try:
                    val = float(spend_cell)
                    if val > 0:
                        amount = val
                        is_valid = True
                except ValueError:
                    pass
                    
            if not is_valid and return_cell is not None:
                try:
                    val = float(return_cell)
                    if val > 0:
                        amount = -val # represent return/refund as negative expense
                        is_valid = True
                except ValueError:
                    pass
            
            if not is_valid:
                continue # Skip row if it has no numerical amount
                
            category = guess_category(merchant)
            
            expenses.append({
                "id": generate_id("exp-"),
                "description": merchant,
                "amount": amount,
                "category": category,
                "creditCardId": card_id,
                "date": current_date
            })
            count += 1
            
        print(f"Imported {count} transactions from sheet {sheet_name}.")

    # 3. Helper to parse bank accounts sheet (Chase)
    def parse_chase_sheet(sheet_name, card_id):
        if sheet_name not in wb.sheetnames:
            print(f"Sheet {sheet_name} not found. Skipping.")
            return
            
        sheet = wb[sheet_name]
        print(f"Parsing Chase sheet: {sheet_name}...")
        
        # Chase header mapping
        # Row 5 contains: Date, From, Salary, Deposit, Withdraw, Details
        rows = list(sheet.iter_rows(values_only=True))
        
        header_row_idx = -1
        col_indices = {}
        for r_idx, row in enumerate(rows):
            row_str = [str(x).lower().strip() if x is not None else "" for x in row]
            if 'date' in row_str and 'from' in row_str and ('withdraw' in row_str or 'withdraws' in row_str):
                header_row_idx = r_idx
                for c_idx, val in enumerate(row_str):
                    if val == 'date' and 'date' not in col_indices:
                        col_indices['date'] = c_idx
                    elif val == 'from' and 'from' not in col_indices:
                        col_indices['from'] = c_idx
                    elif val == 'salary' and 'salary' not in col_indices:
                        col_indices['salary'] = c_idx
                    elif val == 'deposit' and 'deposit' not in col_indices:
                        col_indices['deposit'] = c_idx
                    elif val == 'withdraw' and 'withdraw' not in col_indices:
                        col_indices['withdraw'] = c_idx
                    elif val == 'details' and 'details' not in col_indices:
                        col_indices['details'] = c_idx
                break
                
        if header_row_idx == -1:
            print(f"Warning: Could not find header row for Chase. Skipping.")
            return
            
        print(f"Chase headers found at row {header_row_idx + 1}: {col_indices}")
        
        current_date = None
        count = 0
        
        for r_idx, row in enumerate(rows[header_row_idx + 1:]):
            date_cell = row[col_indices['date']] if 'date' in col_indices and col_indices['date'] < len(row) else None
            if date_cell is not None:
                if isinstance(date_cell, (datetime.datetime, datetime.date)):
                    current_date = date_cell.strftime('%Y-%m-%d')
                else:
                    date_str = str(date_cell).strip()
                    try:
                        dt = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                        current_date = dt.strftime('%Y-%m-%d')
                    except ValueError:
                        pass
            
            if current_date is None:
                continue
                
            from_cell = row[col_indices['from']] if 'from' in col_indices and col_indices['from'] < len(row) else None
            if from_cell is None:
                continue
                
            merchant = str(from_cell).strip()
            if not merchant or merchant.isdigit():
                continue
                
            # Append details to description if present
            details_cell = row[col_indices['details']] if 'details' in col_indices and col_indices['details'] < len(row) else None
            if details_cell is not None and str(details_cell).strip():
                merchant = f"{merchant} ({str(details_cell).strip()})"
                
            withdraw_cell = row[col_indices['withdraw']] if 'withdraw' in col_indices and col_indices['withdraw'] < len(row) else None
            salary_cell = row[col_indices['salary']] if 'salary' in col_indices and col_indices['salary'] < len(row) else None
            deposit_cell = row[col_indices['deposit']] if 'deposit' in col_indices and col_indices['deposit'] < len(row) else None
            
            amount = 0.0
            is_valid = False
            
            # Withdraw represents spending (positive expense)
            if withdraw_cell is not None:
                try:
                    val = float(withdraw_cell)
                    if val > 0:
                        amount = val
                        is_valid = True
                except ValueError:
                    pass
            
            # Salary/Deposit represents income (negative expense)
            if not is_valid and salary_cell is not None:
                try:
                    val = float(salary_cell)
                    if val > 0:
                        amount = -val
                        is_valid = True
                except ValueError:
                    pass
                    
            if not is_valid and deposit_cell is not None:
                try:
                    val = float(deposit_cell)
                    if val > 0:
                        amount = -val
                        is_valid = True
                except ValueError:
                    pass
                    
            if not is_valid:
                continue
                
            category = guess_category(merchant)
            
            expenses.append({
                "id": generate_id("exp-"),
                "description": merchant,
                "amount": amount,
                "category": category,
                "creditCardId": card_id,
                "date": current_date
            })
            count += 1
            
        print(f"Imported {count} transactions from Chase sheet.")

    # Parse each sheet
    for card_name, card_id in card_name_to_id.items():
        if card_name in default_cards_map:
            sheet_name = default_cards_map[card_name]['sheet']
            if sheet_name == 'Chase':
                parse_chase_sheet(sheet_name, card_id)
            else:
                parse_card_sheet(sheet_name, card_id)

    # 4. Construct final db.json
    db_data = {
        "categories": CATEGORIES,
        "cards": cards,
        "expenses": expenses
    }
    
    print(f"\nWriting database to {DB_JSON_PATH}...")
    with open(DB_JSON_PATH, 'w') as f:
        json.dump(db_data, f, indent=2)
        
    print(f"Migration complete! Generated {len(cards)} cards, {len(CATEGORIES)} categories, and {len(expenses)} expenses.")

    # 5. Automatically trigger Supabase migration script
    import subprocess
    migrate_script_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'migrate.js')
    if os.path.exists(migrate_script_path):
        print(f"\nTriggering cloud sync to Supabase: {migrate_script_path}...")
        try:
            result = subprocess.run(['node', migrate_script_path], capture_output=True, text=True, check=True)
            print(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"Error running cloud sync migration:\n{e.stderr}")
    else:
        print(f"\nCloud sync script not found at: {migrate_script_path}")

if __name__ == '__main__':
    main()
