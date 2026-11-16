# Evaluation results: eval/cases.json (hosted Worker https://cavli-assignment-2.nishanameenk.workers.dev, hybrid retrieval, model gate)

Run at 2026-11-15T10:16:04+00:00 UTC. 13/14 cases passed. 31/31 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| E01 | answerable | Which pin resets the bare C16QS module, and how long must it be held low? | Answer pin 17 (RSTN), pulled low for 100-500 ms; cite the hardware manual Section 3.4.2. | hardware-manual p. 31 | answered | HW 5.3 p. 31; HW 5.3 p. 22 | 2/2 valid | PASS | none | 4036 ms |
| E02 | answerable | What are the VB operating conditions (minimum, typical and maximum voltage) for the C16QS? | 3.1 V min, 3.8 V typical, 4.5 V max from Table 3.3 Operating Condition. | hardware-manual p. 20/13/27/60 | answered | HW 5.3 p. 20 | 1/1 valid | PASS | none | 2484 ms |
| E03 | answerable | What is jumper JMP 3 used for on the C16QS EVK? | Selects the EVK input power source: USB Type-C or +5V adapter; cite EVK manual component description. | evk-user-manual p. 13/11/17 | answered | EVK 1.1 p. 13, PDF page 12; EVK 1.1 p. 17, PDF page 16 | 2/2 valid | PASS | none | 2068 ms |
| E04 | answerable | Which COM ports appear on the PC after the C16QS EVK has booted? | After full boot over USB Type-C: 2x COM for AT port and 1x COM for DM port. | evk-user-manual p. 20/13 | answered | EVK 1.1 p. 20, PDF page 19 | 1/1 valid | PASS | none | 2356 ms |
| E05 | answerable | Which AT command restarts the C16QS? | AT$QCRST (AT manual 16.31). The hardware manual's AT+TRB is not in the AT manual; if cited it must carry the cross-reference flag. | at-command-manual p. 193 | answered_with_flags | AT 3.1 p. 193; HW 5.3 p. 31 | 2/2 valid | PASS | none | 1622 ms |
| E06 | answerable | What is the normal operating temperature range of the C16QS module? | -30 °C to +85 °C (Table 2.1 / Table 5.1). | hardware-manual p. 14/58 | not_verified | none | n/a | FAIL | over_refusal | 43058 ms |
| E07 | answerable | Which LTE bands does the C16QS India (IN) variant support? | Bands 1, 3, 5, 8, 40, 41; all current sources agree, so no conflict flag. | hardware-manual p. 12/14/54; product-page Cellular Bands Supported | answered | HW 5.3 p. 12; HW 5.3 p. 14; HW 5.3 p. 54; Web 20261114-c81b8bc8 Technical Data > Cellular Bands Supported | 4/4 valid | PASS | none | 811 ms |
| E08 | ambiguous | What supply voltage does the C16QS need? | Ask whether bare module or EVK; give module VBAT 3.1-4.5 V (3.8 V typ) and EVK input options, each cited. | hardware-manual p. 13/20/27/28/60; evk-user-manual p. 13/14/16/17/18 | ambiguous | HW 5.3 p. 27; HW 5.3 p. 28; EVK 1.1 p. 11, PDF page 10; EVK 1.1 p. 13, PDF page 12 | 4/4 valid | PASS | none | 9157 ms |
| E09 | ambiguous | Which LTE bands does the C16QS support? | Bands depend on regional variant; ask which variant/SKU and show per-variant lists with disputed bands marked. | hardware-manual p. 12/14/54; product-page Cellular Bands Supported | ambiguous | HW 5.3 p. 12; HW 5.3 p. 14; HW 5.3 p. 54; Web 20261114-c81b8bc8 Technical Data > Cellular Bands Supported | 4/4 valid | PASS | none | 1392 ms |
| E10 | conflict | Does the C16QS-WW support LTE Band 38? | Hardware manual 5.3 lists B38 for W.W; product page WW list omits it. Same variant-level scope. Show both, do not confirm, flag for expert review. | hardware-manual p. 14/12/54; product-page Cellular Bands Supported | conflict | HW 5.3 p. 12; HW 5.3 p. 14; HW 5.3 p. 54; Web 20261114-c81b8bc8 Technical Data > Cellular Bands Supported | 4/4 valid | PASS | none | 940 ms |
| E11 | unanswerable | Is the C16QS certified for use with my custom-designed antenna? | Not verified; sources state FCC modular conditions only. Show related context (Sections 9.4.3/9.4.4) and escalate. | hardware-manual p. 75/76/77/78 (related) | not_verified | none \| related: HW 5.3 p. 75; HW 5.3 p. 76; HW 5.3 p. 74 | 3/3 valid | PASS | none | 1444 ms |
| E12 | unanswerable | How long will the battery last on a C16QS-based tracker? | Not verified; no duty cycle or battery capacity given and no battery-life figure exists. Point to per-mode current table as context. | hardware-manual p. 60/61/16 (related) | not_verified | none \| related: HW 5.3 p. 16; HW 5.3 p. 60; HW 5.3 p. 61 | 3/3 valid | PASS | none | 1414 ms |
| E13 | unanswerable | What is the unit price of the C16QS for 10,000 pieces? | Not verified: no pricing in the sources (the product page only says 'priced highly competitively'). | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 10896 ms |
| E14 | revision | How long must the C16QS reset pin be held low? | After ingesting the SIMULATED 5.4 revision, answer from 5.4 (150-500 ms), label it simulated, show the 5.3 wording and the open revision-change review item. | hardware-manual p. 31 | answered_with_flags | HW 5.4-SIMULATED p. 31 | 1/1 valid | PASS | none | 5948 ms |

## Observed answers

### E01 - Which pin resets the bare C16QS module, and how long must it be held low?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 4036 ms

> The reset pin for the C16QS module is Pin 17, which is labeled as RSTN [HW-v5.3-p031-2, HW-v5.3-p022-1]. To reset the module, this pin must be pulled low for a duration of 100-500ms [HW-v5.3-p031-2].

- Review #5 (cross_reference_gap): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module Hardware Manual (rev 5.3, page 31) but is not documented in the current AT Command Manual.
- Citation `HW-v5.3-p031-2`: valid (quote found on PDF page 31 (printed 31))
- Citation `HW-v5.3-p022-1`: valid (quote found on PDF page 22 (printed 22))

### E02 - What are the VB operating conditions (minimum, typical and maximum voltage) for the C16QS?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2484 ms

> The operating voltage conditions for the VB pin on the C16QS module are a minimum of 3.1 V, a typical value of 3.8 V, and a maximum of 4.5 V [HW-v5.3-p020-2].

- Citation `HW-v5.3-p020-2`: valid (quote found on PDF page 20 (printed 20))

### E03 - What is jumper JMP 3 used for on the C16QS EVK?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2068 ms

> Jumper 3 (JMP 3) is used to switch between the voltage sources, specifically the USB Type-C and the +5V Adapter [EVK-v1.1-p012-1]. The first position enables the USB Type-C as the input voltage source, while the second position enables the +5V Adapter as the voltage source [EVK-v1.1-p012-1]. Users must place the jumper according to the input power supply being used [EVK-v1.1-p016-1].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p012-1`: valid (quote found on PDF page 12 (printed 13))
- Citation `EVK-v1.1-p016-1`: valid (quote found on PDF page 16 (printed 17))

### E04 - Which COM ports appear on the PC after the C16QS EVK has booted?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2356 ms

> After the C16QS EVK has fully booted, the Type-C USB interface automatically initializes three COM ports on a Windows PC: two COM ports for the AT Port and one COM port for the DM Port [EVK-v1.1-p019-1].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p019-1`: valid (quote found on PDF page 19 (printed 20))

### E05 - Which AT command restarts the C16QS?

Status: **answered_with_flags** - mode `gemini:gemini-3.1-flash-lite` - 1622 ms

> The C16QS module supports restarting via the AT$QCRST command [AT-v3.1-p193-2]. Additionally, the hardware manual notes that the module supports an AT command reset using AT+TRB to restart the module [HW-v5.3-p031-2].

- Review #5 (cross_reference_gap): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module Hardware Manual (rev 5.3, page 31) but is not documented in the current AT Command Manual.
- Citation `AT-v3.1-p193-2`: valid (quote found on PDF page 193 (printed 193))
- Citation `HW-v5.3-p031-2`: valid (quote found on PDF page 31 (printed 31))

### E06 - What is the normal operating temperature range of the C16QS module?

Status: **not_verified** - mode `model unavailable` - 43058 ms

> Not verified in the available C16QS sources. The answer model is unavailable right now, so no answer could be checked. The closest passages are shown as context; please try again.

- Generation note: generation unavailable (Gemini timed out (after retry))

### E07 - Which LTE bands does the C16QS India (IN) variant support?

Status: **answered** - mode `structured band claims` - 811 ms

> LTE bands listed for the IN variant: Cavli C16QS LTE CAT1.bis Module Hardware Manual 5.3 (p. 12): 1, 3, 5, 8, 40, 41 [HW-v5.3-p012-2] \| Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported): 1, 3, 5, 8, 40, 41 [WEB-snapshot-20261114-c81b8bc8-s08]

- Citation `HW-v5.3-p012-2`: valid (quote found on PDF page 12 (printed 12))
- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))
- Citation `HW-v5.3-p054-2`: valid (quote found on PDF page 54 (printed 54))
- Citation `WEB-snapshot-20261114-c81b8bc8-s08`: valid (quote found in re-extracted product page)

### E08 - What supply voltage does the C16QS need?

Status: **ambiguous** - mode `gemini:gemini-3.1-flash-lite (per scope)` - 9157 ms

> This depends on what you are powering. Bare module: The C16QS module power supply range is between 3.1V – 4.5V [HW-v5.3-p028-1]. The typical operating voltage is 3.8V [HW-v5.3-p027-2]. It is recommended to use a 3.8 V/830 mA power supply [HW-v5.3-p028-1]. EVK board: The C16QS EVK board supports power input via USB Type-C or a +5V Adapter, which are selected using Jumper 3 (JMP 3) [EVK-v1.1-p012-1]. The JMP 3 configuration identifies the input pins as 5V_ADAP and 5V_USB [EVK-v1.1-p010-2].
>
> Clarifying question: Do you mean the bare C16QS module (VBAT) or the C16QS EVK board input?

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `HW-v5.3-p027-2`: valid (quote found on PDF page 27 (printed 27))
- Citation `HW-v5.3-p028-1`: valid (quote found on PDF page 28 (printed 28))
- Citation `EVK-v1.1-p010-2`: valid (quote found on PDF page 10 (printed 11))
- Citation `EVK-v1.1-p012-1`: valid (quote found on PDF page 12 (printed 13))

### E09 - Which LTE bands does the C16QS support?

Status: **ambiguous** - mode `structured band claims` - 1392 ms

> LTE band support depends on the C16QS regional variant, so there is no single answer. Bands listed by every current source, per variant: AN: 1, 3, 5, 8, 18, 19, 26, 28 \| EA: 1, 3, 5, 8, 20 \| EAJ: 1, 3, 5, 7, 8, 18, 19, 20, 26, 28, 40, 41; disputed between sources: 38 \| EU: 1, 3, 5, 7, 8, 20, 28 \| IN: 1, 3, 5, 8, 40, 41 \| LA: 1, 2, 3, 4, 5, 7, 8; disputed between sources: 28 \| NA: 2, 4, 5, 12, 25, 66; disputed between sources: 13 \| WW: 1, 2, 3, 4, 5, 7, 8, 12, 18, 19, 20, 25, 26, 28, 40, 41, 66; disputed between sources: 13, 38.
>
> Clarifying question: Which variant or SKU do you mean (for example C16QS-WW-GNAH or C16QS-IN-GNAN)?

- Review #1 (conflict): EAJ variant LTE band list differs (cross-source); disputed bands: 38. Do not treat any disputed band as confirmed.
- Review #2 (conflict): LA variant LTE band list differs (cross-source); disputed bands: 28. Do not treat any disputed band as confirmed.
- Review #3 (conflict): NA variant LTE band list differs (cross-source); disputed bands: 13. Do not treat any disputed band as confirmed.
- Review #4 (conflict): WW variant LTE band list differs (cross-source); disputed bands: 13, 38. Do not treat any disputed band as confirmed.
- Citation `HW-v5.3-p012-2`: valid (quote found on PDF page 12 (printed 12))
- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))
- Citation `HW-v5.3-p054-2`: valid (quote found on PDF page 54 (printed 54))
- Citation `WEB-snapshot-20261114-c81b8bc8-s08`: valid (quote found in re-extracted product page)

### E10 - Does the C16QS-WW support LTE Band 38?

Status: **conflict** - mode `structured band claims` - 940 ms

> Conflicting evidence for Band 38 on WW: listed in Cavli C16QS LTE CAT1.bis Module Hardware Manual 5.3 (pp. 12, 14, 54), but not listed in Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported). It is not treated as confirmed and is queued for expert review (item #4). Evidence: Cavli C16QS LTE CAT1.bis Module Hardware Manual 5.3 (p. 12): 1, 2, 3, 4, 5, 7, 8, 12, 13, 18, 19, 20, 25, 26, 28, 38, 40, 41, 66 [HW-v5.3-p012-2] \| Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported): 1, 2, 3, 4, 5, 7, 8, 12, 18, 19, 20, 25, 26, 28, 40, 41, 66 [WEB-snapshot-20261114-c81b8bc8-s08]

- Review #4 (conflict): WW variant LTE band list differs (cross-source); disputed bands: 13, 38. Do not treat any disputed band as confirmed.
- Citation `HW-v5.3-p012-2`: valid (quote found on PDF page 12 (printed 12))
- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))
- Citation `HW-v5.3-p054-2`: valid (quote found on PDF page 54 (printed 54))
- Citation `WEB-snapshot-20261114-c81b8bc8-s08`: valid (quote found in re-extracted product page)

### E11 - Is the C16QS certified for use with my custom-designed antenna?

Status: **not_verified** - mode `guardrail:custom_certification` - 1444 ms

> Not verified in the available C16QS sources. The sources do not certify any specific custom antenna or end product. The hardware manual only states the conditions under which the module's FCC authorization stays valid, and it names no approved antenna models. Escalate to Cavli support and a certification specialist; human approval is required. Related passages shown as context only: HW 5.3 p. 75 §9.4.3 OEM Integration Instructions; HW 5.3 p. 76 §9.4.4 Validity of using the module certification; HW 5.3 p. 74 §9.3 IC Information.

- Citation `HW-v5.3-p075-3`: valid (quote found on PDF page 75 (printed 75))
- Citation `HW-v5.3-p076-1`: valid (quote found on PDF page 76 (printed 76))
- Citation `HW-v5.3-p074-1`: valid (quote found on PDF page 74 (printed 74))

### E12 - How long will the battery last on a C16QS-based tracker?

Status: **not_verified** - mode `guardrail:battery_life` - 1414 ms

> Not verified in the available C16QS sources. None of the sources states a battery life. It depends on the device's duty cycle, network conditions and battery capacity, none of which is given. The hardware manual lists current per operating mode, which an engineer could use with a measured usage profile. Share the intended duty cycle and battery capacity with Cavli support for a power estimate. Related passages shown as context only: HW 5.3 p. 16 §2.4 Module Working Mode; HW 5.3 p. 60 §5.6 Power Consumption Characteristics; HW 5.3 p. 61 §5.6 Power Consumption Characteristics.

- Citation `HW-v5.3-p016-1`: valid (quote found on PDF page 16 (printed 16))
- Citation `HW-v5.3-p060-2`: valid (quote found on PDF page 60 (printed 60))
- Citation `HW-v5.3-p061-1`: valid (quote found on PDF page 61 (printed 61))

### E13 - What is the unit price of the C16QS for 10,000 pieces?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 10896 ms

> Not verified in the available C16QS sources. The provided documents do not contain information regarding the unit price of the C16QS module for any quantity, including 10,000 pieces.


### E14 - How long must the C16QS reset pin be held low?

Status: **answered_with_flags** - mode `gemini:gemini-3.1-flash-lite` - 5948 ms

> To reset the C16QS module, the reset pin (Pin 17) must be pulled low for 150-500ms. This information is provided in a simulated revision of the hardware manual.

- Warning: Cites a SIMULATED revision - not a Cavli publication.
- Warning: Passage changed in 5.4-SIMULATED vs 5.3 (p. 31): was “software does not respond, the module can be reset. Pull the pin low for 100-500ms to reset the module. The” (review #13).
- Review #11 (cross_reference_gap): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module Hardware Manual (rev 5.4-SIMULATED, page 31) but is not documented in the current AT Command Manual.
- Review #13 (revision_change): c16qs-hardware-manual revision 5.4-SIMULATED supersedes 5.3: 2 changed page(s)/section(s); numeric values changed: yes.
- Citation `HW-v5.4-SIMULATED-p031-2`: valid (simulated revision: quote matches the simulated page text, not a real PDF)
