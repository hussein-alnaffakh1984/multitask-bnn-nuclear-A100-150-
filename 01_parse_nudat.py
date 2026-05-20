# ============================================================
# Stage 8 — Cell 1: IMPROVED NUDAT Parser
# Fixes the bugs discovered in audit:
#   - Captures FIRST 2+ correctly (not just any 2+)
#   - Captures FIRST 4+ correctly (not 2nd/3rd 4+)
#   - Computes R(4/2) = E(4+)/E(2+) correctly
#   - Also extracts first 3- state (bonus output)
#   - Tracks confidence flags
# ============================================================

import re
import pandas as pd
import numpy as np
from pathlib import Path
from bs4 import BeautifulSoup

output_dir = Path("/kaggle/working/data")
nudat_cache_dir = output_dir / "nudat_html_cache"

df_ee = pd.read_csv(output_dir / "even_even_targets.csv")
print(f"Targets to parse: {len(df_ee)} even-even nuclei")
print()

# ============================================================
# Helper functions (improved versions)
# ============================================================
def is_xref(cell):
    return bool(cell) and bool(re.match(r'^[A-Z]{1,8}$', cell))

def is_jpi(cell):
    """Check if cell is a Jπ assignment like '2+', '4+', '(2+)', '0+'"""
    if not cell:
        return False
    cleaned = cell.replace('(', '').replace(')', '').strip()
    patterns = [
        r'^\d+[+\-]$',
        r'^\d+/\d+[+\-]?$',
        r'^\d+,\d+[+\-]?$',
        r'^\d+,\d+,\d+[+\-]?$',
    ]
    return any(re.match(p, cleaned) for p in patterns)

def is_level_energy(cell):
    """Parse level energy in keV. Returns float or None."""
    if not cell:
        return None
    # Remove uncertainty digits at end (e.g., "212.5325" might be "212.532 5")
    m = re.match(r'^(\d+(?:\.\d+)?)(\d+)?$', cell)
    if m:
        try:
            value = float(m.group(1))
            if 0 <= value <= 8000:
                return value
        except ValueError:
            return None
    return None

def clean_jpi(jpi):
    """Strip parentheses and whitespace from Jπ string."""
    return jpi.replace('(', '').replace(')', '').strip()

def extract_levels(soup):
    """Extract sorted list of levels from NUDAT HTML."""
    all_tables = soup.find_all('table')
    if len(all_tables) < 3:
        return []
    
    levels_table = None
    for table in all_tables:
        if 'E(level)' in table.get_text()[:200]:
            levels_table = table
            break
    
    if levels_table is None:
        return []
    
    all_tds = [td.get_text(strip=True) for td in levels_table.find_all('td')]
    levels = []
    i = 8  # Skip header rows
    
    while i < len(all_tds) - 2:
        e_check = is_level_energy(all_tds[i])
        if e_check is not None:
            if i+1 < len(all_tds) and is_xref(all_tds[i+1]):
                if i+2 < len(all_tds) and is_jpi(all_tds[i+2]):
                    E_level = e_check
                    xref = all_tds[i+1]
                    jpi_raw = all_tds[i+2]
                    jpi = clean_jpi(jpi_raw)
                    
                    # Check if Jπ has parentheses (tentative assignment)
                    is_tentative = '(' in jpi_raw or ')' in jpi_raw
                    
                    t_half = ''
                    if i+3 < len(all_tds):
                        next_cell = all_tds[i+3]
                        time_units = [' s', ' ms', ' µs', ' ns', ' ps', ' fs', ' eV', ' keV']
                        if any(u in next_cell for u in time_units) or 'stable' in next_cell.lower():
                            t_half = next_cell
                    
                    levels.append({
                        'E_keV': E_level,
                        'Jpi': jpi,
                        'Jpi_raw': jpi_raw,
                        'tentative': is_tentative,
                        'XREF': xref,
                        'T_half_raw': t_half,
                    })
                    i += 3
                    continue
        i += 1
    
    # Sort by energy (NUDAT usually does this but verify)
    levels.sort(key=lambda x: x['E_keV'])
    return levels

def parse_half_life_to_seconds(t_half_str):
    """Parse '52.9 fs' -> (52.9e-15, 'value')"""
    if not t_half_str or 'stable' in t_half_str.lower():
        return None, None
    units = {
        'fs': 1e-15, 'ps': 1e-12, 'ns': 1e-9,
        'µs': 1e-6, 'us': 1e-6, 'ms': 1e-3,
        's': 1, 'm': 60, 'h': 3600, 'd': 86400, 'y': 3.156e7,
    }
    text = t_half_str.strip()
    is_limit = False
    if text.startswith('<') or text.startswith('>'):
        is_limit = True
        text = text[1:].strip()
    pattern = r'^([\d.]+)\s*(fs|ps|ns|µs|us|ms|d|y|h|m|s)(?=\d|\s|%|$|[+\-<>~])'
    match = re.match(pattern, text)
    if not match:
        return None, None
    try:
        value = float(match.group(1))
        unit = match.group(2)
        if unit not in units:
            return None, None
        return value * units[unit], ('limit' if is_limit else 'value')
    except (ValueError, KeyError):
        return None, None

def compute_BE2_NNDC(E_gamma_keV, T_half_s, alpha_T=0.0, branching=1.0):
    """B(E2)↑ in e²b² from gamma energy and half-life (NNDC formula)."""
    T_half_ps = T_half_s * 1e12
    tau_partial_ps = (T_half_ps / np.log(2)) * (1 + alpha_T) / branching
    return 40.81e13 / (E_gamma_keV**5 * tau_partial_ps)

# ============================================================
# IMPROVED PARSER — finds FIRST occurrence of each Jπ
# ============================================================
def parse_nucleus_html_v2(html, Z, N, A, EL):
    """
    Improved parser that:
    1. Sorts levels by energy (ascending)
    2. Finds FIRST 2+ (lowest-energy 2+ above ground)
    3. Finds FIRST 4+ (lowest-energy 4+)
    4. Finds FIRST 3- (lowest-energy 3- — bonus)
    5. Computes R(4/2) correctly as E(4+)/E(2+)
    6. Flags tentative assignments
    """
    result = {
        'Z': Z, 'N': N, 'A': A, 'EL': EL,
        'nndc_id': f"{A}{EL.upper()}",
        # First 2+
        'E_2plus_keV': None,
        'E_2plus_tentative': None,
        'T_half_2plus_s': None,
        'BE2_up_e2b2': None,
        # First 4+
        'E_4plus_keV': None,
        'E_4plus_tentative': None,
        # First 3-
        'E_3minus_keV': None,
        'E_3minus_tentative': None,
        # Computed
        'R_42': None,
        # Status
        'parse_status': 'unknown',
        'n_levels_found': 0,
    }
    
    try:
        soup = BeautifulSoup(html, 'html.parser')
        levels = extract_levels(soup)
        result['n_levels_found'] = len(levels)
        
        if not levels:
            result['parse_status'] = 'no_levels_found'
            return result
        
        # Find FIRST 2+ (above ground, requiring E > 50 keV to avoid 0+ states)
        for lvl in levels:
            if lvl['Jpi'] == '2+' and lvl['E_keV'] > 50:
                if result['E_2plus_keV'] is None:
                    result['E_2plus_keV'] = lvl['E_keV']
                    result['E_2plus_tentative'] = lvl['tentative']
                    # Extract half-life for B(E2) calculation
                    t_s, _ = parse_half_life_to_seconds(lvl['T_half_raw'])
                    result['T_half_2plus_s'] = t_s
                    break  # Only take FIRST
        
        # Find FIRST 4+ (must be higher than E(2+) and physically plausible)
        e2 = result['E_2plus_keV']
        for lvl in levels:
            if lvl['Jpi'] == '4+' and lvl['E_keV'] > (e2 if e2 else 100):
                if result['E_4plus_keV'] is None:
                    result['E_4plus_keV'] = lvl['E_keV']
                    result['E_4plus_tentative'] = lvl['tentative']
                    break  # Only take FIRST
        
        # Find FIRST 3-
        for lvl in levels:
            if lvl['Jpi'] == '3-' and lvl['E_keV'] > 100:
                if result['E_3minus_keV'] is None:
                    result['E_3minus_keV'] = lvl['E_keV']
                    result['E_3minus_tentative'] = lvl['tentative']
                    break
        
        # Compute R(4/2) CORRECTLY = E(4+) / E(2+)
        if result['E_4plus_keV'] is not None and result['E_2plus_keV'] is not None and result['E_2plus_keV'] > 0:
            result['R_42'] = result['E_4plus_keV'] / result['E_2plus_keV']
        
        # Compute B(E2)↑ from lifetime if available
        if (result['E_2plus_keV'] is not None 
            and result['T_half_2plus_s'] is not None
            and result['T_half_2plus_s'] > 0):
            try:
                result['BE2_up_e2b2'] = compute_BE2_NNDC(
                    result['E_2plus_keV'], result['T_half_2plus_s'])
            except (ValueError, ZeroDivisionError):
                pass
        
        result['parse_status'] = 'success'
        return result
    
    except Exception as e:
        result['parse_status'] = f'error: {type(e).__name__}: {str(e)[:80]}'
        return result

# ============================================================
# Run improved parser on all cached HTML
# ============================================================
print("="*80)
print(f"Parsing {len(df_ee)} cached NUDAT files with IMPROVED parser v2...")
print("="*80)

parsed_data = []
for _, row in df_ee.iterrows():
    cache_path = nudat_cache_dir / f"{row['nndc_id']}.html"
    if not cache_path.exists():
        continue
    with open(cache_path, 'r', encoding='utf-8') as f:
        html = f.read()
    parsed = parse_nucleus_html_v2(html, row['Z'], row['N'], row['A'], row['EL'])
    parsed_data.append(parsed)

df_parsed = pd.DataFrame(parsed_data)

# ============================================================
# Coverage stats
# ============================================================
print(f"\nParsing summary:")
print(f"   Total processed:    {len(df_parsed)}")
print(f"   Parse success:      {(df_parsed['parse_status']=='success').sum()}")
print()
print("Coverage per observable:")
for col in ['E_2plus_keV', 'E_4plus_keV', 'E_3minus_keV', 'R_42', 'BE2_up_e2b2']:
    n = df_parsed[col].notna().sum()
    pct = 100 * n / len(df_parsed)
    print(f"   {col:<22s}: {n:>4d}/{len(df_parsed)} ({pct:>5.1f}%)")

# ============================================================
# CRITICAL VALIDATION — compare to known reference values
# ============================================================
print("\n" + "="*80)
print("VALIDATION on 10 known reference nuclei (must match NUDAT3 exactly!)")
print("="*80)

# These are KNOWN values from NUDAT3 (verified manually)
reference_values = [
    # (A, EL, E2+,    E4+,   R(4/2))
    ('100Zr', 213, 564, 2.65),
    ('100Ru', 540, 1226, 2.27),
    ('102Mo', 297, 744, 2.51),
    ('108Pd', 434, 1048, 2.42),
    ('116Cd', 513, 1213, 2.36),
    ('116Sn', 1294, 2391, 1.85),
    ('120Sn', 1171, 2194, 1.87),
    ('132Sn', 4041, 4416, 1.09),  # doubly-magic, R(4/2) ~ 1!
    ('136Xe', 1313, 1881, 1.43),
    ('152Sm', 122, 366, 3.01),  # rotational
]

print(f"\n{'Nucleus':<10s} {'E(2+) parsed':<15s} {'E(2+) ref':<12s} {'E(4+) parsed':<15s} {'E(4+) ref':<12s} {'R(4/2) parsed':<15s} {'R(4/2) ref':<12s}")
print("-"*120)

n_match_e2 = 0
n_match_e4 = 0
n_match_r = 0
n_checked = 0

for nuc_str, e2_ref, e4_ref, r_ref in reference_values:
    # Parse nucleus identifier
    A = int(re.match(r'^(\d+)', nuc_str).group(1))
    EL = nuc_str[len(str(A)):]
    
    row = df_parsed[df_parsed['nndc_id'].str.upper() == f"{A}{EL.upper()}"]
    if len(row) == 0:
        print(f"{nuc_str:<10s} not in scraped set (probably outside A=100-150)")
        continue
    r = row.iloc[0]
    n_checked += 1
    
    e2_p = r['E_2plus_keV']
    e4_p = r['E_4plus_keV']
    r_p  = r['R_42']
    
    e2_ok = '✓' if (pd.notna(e2_p) and abs(e2_p - e2_ref) < 5) else '✗'
    e4_ok = '✓' if (pd.notna(e4_p) and abs(e4_p - e4_ref) < 10) else '✗'
    r_ok  = '✓' if (pd.notna(r_p) and abs(r_p - r_ref) < 0.05) else '✗'
    
    if e2_ok == '✓': n_match_e2 += 1
    if e4_ok == '✓': n_match_e4 += 1
    if r_ok == '✓': n_match_r += 1
    
    e2_str = f"{e2_p:>7.1f}" if pd.notna(e2_p) else "  None "
    e4_str = f"{e4_p:>7.1f}" if pd.notna(e4_p) else "  None "
    r_str  = f"{r_p:>6.3f}" if pd.notna(r_p)  else " None "
    
    print(f"{nuc_str:<10s} {e2_str} {e2_ok:<4s} {e2_ref:<7d}     {e4_str} {e4_ok:<4s} {e4_ref:<7d}     {r_str} {r_ok:<4s} {r_ref:<7.2f}")

print()
print(f"Validation summary:")
print(f"   E(2+) match: {n_match_e2}/{n_checked}")
print(f"   E(4+) match: {n_match_e4}/{n_checked}")
print(f"   R(4/2) match: {n_match_r}/{n_checked}")

# ============================================================
# Save
# ============================================================
out_path = output_dir / "nudat_data_A100to150_v2.csv"
df_parsed.to_csv(out_path, index=False)
print(f"\nSaved: {out_path.name}  ({out_path.stat().st_size/1024:.1f} KB)")
print(f"\nDone. Next: run Cell 2 to build extended dataset with 14 targets.")
