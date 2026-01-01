# Tableau TWB XML Reference for MCP Tool Development

> **📘 Developer Reference Document**
>
> This document is for developers who want to understand how Tableau workbook XML is structured and parsed.
> It was used to build the 7 TWBX analysis tools in this MCP server.
>
> **For end users**: You don't need to read this file to use the MCP server. See [README.md](README.md) instead.

## Purpose
This reference guide documents the XML structure of Tableau workbooks (.twb files) and provides implementation patterns for 7 TWBX analysis MCP tools:

**Workbook Analysis Tools:**
1. `download_workbook_twbx` — Download workbook files from Tableau Public
2. `unpack_twbx` — Extract contents from .twbx archives
3. `get_twbx_workbook_structure` — Complete workbook architecture extraction
4. `get_twbx_calculated_fields` — Extract calculated fields and formulas
5. `get_twbx_calculation_dependencies` — Calculation dependency graph analysis
6. `get_twbx_lod_expressions` — LOD expression extraction with classification
7. `get_twbx_data_profile` — Profile embedded data files

---

## Core XML Structure

A `.twb` file is UTF-8 encoded XML. Parse with `xml.etree.ElementTree` (Python) or `fast-xml-parser` (Node.js).

### Root Element
```xml
<workbook locale='en_GB' 
          source-build='2022.3.0 (20223.22.1005.1835)' 
          source-platform='win' 
          version='18.1'
          xmlns:user='http://www.tableausoftware.com/xml/user'>
```

---

## Key XML Paths & Elements

### 1. Data Sources
**Path:** `//datasources/datasource`

```xml
<datasources>
  <datasource name='Sample - Superstore' inline='true' version='9.0'>
    <connection class='excel-direct' filename='Sample.xls' validate='no'>
      <relation name='Orders$' table='[Orders$]' type='table'>
        <columns header='yes'>
          <column datatype='integer' name='Row ID' ordinal='0'/>
          <column datatype='string' name='Order ID' ordinal='1'/>
        </columns>
      </relation>
    </connection>
    <metadata-records>
      <metadata-record class='column'>
        <remote-name>Order ID</remote-name>
        <local-name>[Order ID]</local-name>
        <local-type>string</local-type>
        <aggregation>Count</aggregation>
      </metadata-record>
    </metadata-records>
  </datasource>
</datasources>
```

**Key attributes:**
- `datasource[@name]` — Data source identifier
- `datasource[@inline='true']` — Embedded vs published
- `connection[@class]` — Connection type: `excel-direct`, `sqlserver`, `postgres`, etc.
- `relation[@type='table']` — Regular table
- `relation[@type='text']` — Custom SQL (query is text content)

**Join structure (when present):**
```xml
<relation join='inner' type='join'>
  <clause type='join'>
    <expression op='='>
      <expression op='[Orders$].[Region]'/>
      <expression op='[People$].[Region]'/>
    </expression>
  </clause>
</relation>
```

---

### 2. Parameters
**Path:** `//datasource[@name='Parameters']/column`

Parameters are stored as a fake datasource named "Parameters":

```xml
<datasource hasconnection='false' inline='true' name='Parameters'>
  <column caption='Top Customers' 
          datatype='integer' 
          name='[Parameter 1]' 
          param-domain-type='range' 
          role='measure' 
          type='quantitative' 
          value='5'>
    <calculation class='tableau' formula='5'/>  <!-- default value -->
    <range granularity='5' max='20' min='5'/>   <!-- allowable range -->
  </column>
</datasource>
```

**`param-domain-type` values:** `range`, `list`, `all`

---

### 3. Calculated Fields
**Path:** `//datasource/column[calculation]`

```xml
<column caption='Profit Ratio' 
        datatype='real' 
        default-format='p0%' 
        name='[Calculation_5571209093911105]' 
        role='measure' 
        type='quantitative'>
  <calculation class='tableau' 
               formula='SUM([Profit])/SUM([Sales])' 
               scope-isolation='false'/>
</column>
```

**Key attributes:**
- `column[@caption]` — Display name
- `column[@name]` — Internal name (e.g., `[Calculation_xxxxx]`)
- `column[@role]` — `dimension` or `measure`
- `column[@hidden='true']` — Hidden from UI
- `calculation[@formula]` — The actual formula
- `calculation[@class='tableau']` — Indicates Tableau calculation

**Extraction pattern (Python):**
```python
for item in root.findall('.//column[@caption]'):
    calc = item.find('.//calculation')
    if calc is not None:
        name = item.attrib.get('caption')
        formula = calc.attrib.get('formula')
```

---

### 4. LOD Expressions
LOD expressions are in `calculation[@formula]` matching this pattern:

```
{FIXED|INCLUDE|EXCLUDE [dim1], [dim2], ... : AGG([measure])}
```

**Regex pattern:**
```python
lod_pattern = r'\{(FIXED|INCLUDE|EXCLUDE)\s*([^:]*):([^}]+)\}'
```

**Example formulas:**
```
{FIXED [Customer ID] : SUM([Sales])}
{INCLUDE [Region] : AVG([Profit])}
{EXCLUDE [Category] : COUNTD([Order ID])}
```

**Nested LOD detection:** Check if inner expression contains another `{FIXED|INCLUDE|EXCLUDE`

---

### 5. Worksheets
**Path:** `//worksheets/worksheet`

```xml
<worksheet name='Sales by Category'>
  <table>
    <view>
      <datasources>
        <datasource name='Sample - Superstore'/>
      </datasources>
      <datasource-dependencies datasource='Sample - Superstore'>
        <column datatype='string' name='[Category]' role='dimension'/>
        <column datatype='real' name='[Sales]' role='measure'/>
      </datasource-dependencies>
      <filter class='categorical' column='[Sample - Superstore].[Segment]'/>
      <rows>[Sample - Superstore].[none:Category:nk]</rows>
      <cols>[Sample - Superstore].[sum:Sales:qk]</cols>
    </view>
  </table>
</worksheet>
```

**Shelf contents:**
- `<rows>` — Row shelf fields
- `<cols>` — Column shelf fields
- `<filter>` — Applied filters

**Mark encodings:**
```xml
<encodings>
  <size column='[Sample - Superstore].[sum:Profit:qk]'/>
  <color column='[Sample - Superstore].[none:Category:nk]'/>
  <lod column='[Sample - Superstore].[none:Country:nk]'/>  <!-- Detail -->
</encodings>
```

**Field reference format:** `[DataSource].[prefix:FieldName:suffix]`
- Prefixes: `none`, `sum`, `avg`, `count`, etc.
- Suffixes: `nk` (nominal), `qk` (quantitative), `ok` (ordinal)

---

### 6. Dashboards
**Path:** `//dashboards/dashboard`

```xml
<dashboard name='Main Dashboard'>
  <style/>
  <size width='800' height='600'/>
  <zones>
    <zone h='100000' w='100000' x='0' y='0' type='layout-basic'>
      <zone name='Sales by Category' type='worksheet' h='50000' w='80000'/>
      <zone name='Profit Map' type='worksheet' h='50000' w='80000'/>
      <zone type='text' id='text-123'>...</zone>
    </zone>
  </zones>
</dashboard>
```

**Zone types:** `layout-basic` (container), `worksheet`, `text`, `image`, `web`

**Coordinates:** 100000 units = 100% of container

---

### 7. Dashboard Actions
**Path:** `//dashboard//action` or `//window/action`

```xml
<action name='Filter Action 1' run-type='select'>
  <source datasource='Sample - Superstore' worksheet='Sales Map'/>
  <target datasource='Sample - Superstore' worksheet='Detail Table'>
    <excluded-columns>
      <column>[Sample - Superstore].[Order Date]</column>
    </excluded-columns>
  </target>
</action>
```

**Action types (via element or attributes):**
- Filter actions
- Highlight actions  
- URL actions (`<url>` child element)
- Parameter actions
- Go to Sheet actions

---

### 8. Groups & Sets
**Groups:**
```xml
<column caption='Manufacturer' name='[Product Name (group)]' role='dimension'>
  <calculation class='categorical-bin' column='[Product Name]'>
    <bin value='"3M Products"'>
      <value>"3M Hangers"</value>
      <value>"3M Office Air Cleaner"</value>
    </bin>
  </calculation>
</column>
```

**Sets:** Look for `<set>` elements or `calculation[@class='set']`

---

## Tool Implementation Guide

### Tool 1: `get_twbx_workbook_structure`

**Extract:**
```python
def get_workbook_structure(twb_path):
    tree = ET.parse(twb_path)
    root = tree.getroot()
    
    result = {
        'version': root.attrib.get('version'),
        'platform': root.attrib.get('source-platform'),
        'dataSources': [],
        'worksheets': [],
        'dashboards': [],
        'parameters': []
    }
    
    # Data sources
    for ds in root.findall('.//datasource'):
        if ds.attrib.get('name') == 'Parameters':
            # Handle parameters separately
            for col in ds.findall('.//column'):
                result['parameters'].append({
                    'name': col.attrib.get('caption'),
                    'dataType': col.attrib.get('datatype'),
                    'domainType': col.attrib.get('param-domain-type'),
                    'currentValue': col.attrib.get('value')
                })
        else:
            conn = ds.find('.//connection')
            result['dataSources'].append({
                'name': ds.attrib.get('name'),
                'caption': ds.attrib.get('caption', ds.attrib.get('name')),
                'connectionType': conn.attrib.get('class') if conn else None,
                'tables': [r.attrib.get('name') for r in ds.findall('.//relation[@type="table"]')]
            })
    
    # Worksheets
    for ws in root.findall('.//worksheet'):
        view = ws.find('.//view')
        result['worksheets'].append({
            'name': ws.attrib.get('name'),
            'dataSources': [d.attrib.get('name') for d in view.findall('.//datasources/datasource')] if view else [],
            'filters': [f.attrib.get('column') for f in ws.findall('.//filter')]
        })
    
    # Dashboards
    for db in root.findall('.//dashboard'):
        zones = db.findall('.//zone[@type="worksheet"]')
        result['dashboards'].append({
            'name': db.attrib.get('name'),
            'worksheets': [z.attrib.get('name') for z in zones],
            'size': {
                'width': db.find('.//size').attrib.get('width') if db.find('.//size') is not None else None,
                'height': db.find('.//size').attrib.get('height') if db.find('.//size') is not None else None
            }
        })
    
    return result
```

### Tool 2: `get_twbx_calculation_dependencies`

**Build dependency graph:**
```python
import re

def extract_field_references(formula):
    """Extract [FieldName] references from a formula"""
    return re.findall(r'\[([^\]]+)\]', formula)

def get_calculation_dependencies(twb_path):
    tree = ET.parse(twb_path)
    root = tree.getroot()
    
    # First pass: collect all calculations
    calculations = {}
    for col in root.findall('.//column'):
        calc = col.find('.//calculation[@class="tableau"]')
        if calc is not None and calc.attrib.get('formula'):
            name = col.attrib.get('caption', col.attrib.get('name'))
            internal_name = col.attrib.get('name')
            formula = calc.attrib.get('formula')
            calculations[internal_name] = {
                'name': name,
                'formula': formula,
                'references': extract_field_references(formula)
            }
    
    # Second pass: resolve dependencies
    calc_names = set(calculations.keys())
    for internal_name, calc in calculations.items():
        calc['referencedCalculations'] = [
            ref for ref in calc['references'] 
            if f'[{ref}]' in calc_names or ref in [c['name'] for c in calculations.values()]
        ]
        calc['referencedFields'] = [
            ref for ref in calc['references'] 
            if ref not in calc['referencedCalculations']
        ]
    
    # Calculate depth (topological sort)
    # ... implementation
    
    return calculations
```

### Tool 3: `get_twbx_lod_expressions`

```python
def get_lod_expressions(twb_path):
    tree = ET.parse(twb_path)
    root = tree.getroot()
    
    lod_pattern = re.compile(r'\{(FIXED|INCLUDE|EXCLUDE)\s*([^:]*):([^}]+)\}', re.IGNORECASE)
    
    lod_expressions = []
    for col in root.findall('.//column'):
        calc = col.find('.//calculation[@class="tableau"]')
        if calc is None:
            continue
        formula = calc.attrib.get('formula', '')
        matches = lod_pattern.findall(formula)
        
        if matches:
            for lod_type, dimensions, expression in matches:
                # Parse dimensions (comma-separated field names)
                dims = [d.strip().strip('[]') for d in dimensions.split(',') if d.strip()]
                
                # Extract aggregation function
                agg_match = re.match(r'(SUM|AVG|COUNT|COUNTD|MIN|MAX|MEDIAN|ATTR)\s*\(', expression.strip(), re.IGNORECASE)
                
                lod_expressions.append({
                    'name': col.attrib.get('caption', col.attrib.get('name')),
                    'formula': formula,
                    'lodType': lod_type.upper(),
                    'dimensions': dims,
                    'aggregation': agg_match.group(1) if agg_match else None,
                    'aggregatedExpression': expression.strip(),
                    'hasNestedLod': bool(lod_pattern.search(expression))
                })
    
    return {
        'lodExpressions': lod_expressions,
        'summary': {
            'total': len(lod_expressions),
            'byType': {
                'fixed': len([l for l in lod_expressions if l['lodType'] == 'FIXED']),
                'include': len([l for l in lod_expressions if l['lodType'] == 'INCLUDE']),
                'exclude': len([l for l in lod_expressions if l['lodType'] == 'EXCLUDE'])
            }
        }
    }
```

---

## Reference Resources

| Resource | URL | Content |
|----------|-----|---------|
| **Fully Documented TWB XML** | https://github.com/ranvithm/tableau.xml | Complete XML structure guide |
| **Chris Toomey's Gist** | https://gist.github.com/cmtoomey/96342ba07dd5cba6ecc6 | Annotated Superstore TWB |
| **CoEnterprise Guide** | https://www.coenterprise.com/blog/uncovering-the-value-of-tableaus-workbook-xml-metadata/ | Metadata overview |
| **TWB Parser (R)** | https://cran.r-project.org/web/packages/twbparser/twbparser.pdf | R package reference |
| **Python Extractor** | https://thedotviz.com/index.php/2019/05/27/tableau-calculation-extractor/ | Python extraction script |
| **XML Parse Repo** | https://github.com/drintoul/tableau-xml-parse | Python tool for field extraction |

---

## Parsing Tips

1. **Always handle both `caption` and `name`** — Display name is in `caption`, internal ID in `name`
2. **Parameters are a datasource** — Named "Parameters" with `hasconnection='false'`
3. **Field references are fully-qualified** — Format: `[DataSource].[prefix:Field:suffix]`
4. **Use forgiving parsing** — Ignore unknown elements; schema evolves with Tableau versions
5. **Encoding** — Always UTF-8; handle XML entities (`&apos;`, `&quot;`, etc.)
6. **Large files** — Consider streaming (`iterparse`) for workbooks >10MB
