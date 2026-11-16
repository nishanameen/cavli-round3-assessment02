# Evaluation results: eval/holdout.json (gemini + validator (extractive fallback))

Run at 2026-11-14T18:31:48+00:00 UTC. 10/10 cases passed. 16/16 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| H01 | answerable | What is the default UART baud rate of the C16QS? | 115200 bps (Table 2.1 or UART1 section). | hardware-manual p. 13/34/35 | answered | HW 5.3 p. 35; HW 5.3 p. 34; HW 5.3 p. 13 | 3/3 valid | PASS | none | 2090 ms |
| H02 | answerable | How long must POWER_KEY be held low to turn on the C16QS? | At least 500 ms (Section 3.4.1). | hardware-manual p. 30 | answered | HW 5.3 p. 30 | 1/1 valid | PASS | none | 1355 ms |
| H03 | answerable | What type of SIM card socket does the C16QS EVK use? | Micro SIM card socket (EVK component 11). | evk-user-manual p. 13 | answered | EVK 1.1 p. 13, PDF page 12 | 1/1 valid | PASS | none | 1360 ms |
| H04 | answerable | What is the C16QS current consumption in Hibernate mode? | 11 µA (Table 5.5). | hardware-manual p. 61 | answered | HW 5.3 p. 60; HW 5.3 p. 61 | 2/2 valid | PASS | none | 30135 ms |
| H05 | answerable | Which command enables internet access through RNDIS on the C16QS EVK? | AT$QCNETDEVCTL=3,1 via the AT port (EVK p. 21); AT manual 16.36 documents the command. | evk-user-manual p. 21; at-command-manual p. 197/198 | answered | EVK 1.1 p. 21, PDF page 20 | 1/1 valid | PASS | none | 1084 ms |
| H06 | ambiguous | What is the maximum input voltage? | Scope unclear: bare module VBAT max 4.5 V vs EVK 5 V input; ask which. | hardware-manual p. 13/20/27/28/60; evk-user-manual p. 11/13/14/16/17/18 | ambiguous | HW 5.3 p. 27; EVK 1.1 p. 13, PDF page 12 | 2/2 valid | PASS | none | 2670 ms |
| H07 | ambiguous | Does the C16QS have an eSIM? | Depends on the SKU: GNAH/S00H variants have eSIM, GNAN/S00N do not. Should say it varies (status answered with that caveat, or ambiguous). | product-page Variants Available/eSIM/C16QS LTE Cat 1bis IoT Module/Key Highlights; at-command-manual p. 36 | answered | Web 20261114-c81b8bc8 Variants Available for Ordering Samples; Web 20261114-c81b8bc8 Go Beyond and Explore > Does C16QS support integrated eSIM? | 2/2 valid | PASS | none | 13567 ms |
| H08 | conflict | Does the C16QS-NA support LTE Band 13? | Hardware manual lists B13 for N.A; product page NA list omits it. Flag conflict, do not confirm. | hardware-manual p. 12/14/54; product-page Cellular Bands Supported | conflict | HW 5.3 p. 12; HW 5.3 p. 14; HW 5.3 p. 54; Web 20261114-c81b8bc8 Technical Data > Cellular Bands Supported | 4/4 valid | PASS | none | 45 ms |
| H09 | unanswerable | What is the MTBF of the C16QS module? | Not verified: no MTBF figure in any source. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1 ms |
| H10 | unanswerable | Is the C16QS certified on the Verizon network? | Not verified: no carrier certification statement in any source. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 6 ms |

## Observed answers

### H01 - What is the default UART baud rate of the C16QS?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2090 ms

> The default baud rate for the Cavli C16QS module is 115200bps. [HW-v5.3-p035-2], [HW-v5.3-p034-2], [HW-v5.3-p013-1]

- Citation `HW-v5.3-p035-2`: valid (quote found on PDF page 35 (printed 35))
- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))

### H02 - How long must POWER_KEY be held low to turn on the C16QS?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1355 ms

> To turn on the C16QS module, the POWER_KEY must be pulled down to a low level for at least 500ms.

- Citation `HW-v5.3-p030-3`: valid (quote found on PDF page 30 (printed 30))

### H03 - What type of SIM card socket does the C16QS EVK use?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1360 ms

> The SIM card socket type used in the C16QS EVK is a micro sim card socket. [EVK-v1.1-p012-1]

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p012-1`: valid (quote found on PDF page 12 (printed 13))

### H04 - What is the C16QS current consumption in Hibernate mode?

Status: **answered** - mode `extractive` - 30135 ms

> “Band 1 15 -98 34 5.1 523 mA Band 2 15 -96 34.1 5 502 mA Band 3 14 -99 34.2 5.1 503 mA” [HW-v5.3-p060-2] “Sleep 1 56 µA Sleep 2 25 µA Hibernate 11 µA” [HW-v5.3-p061-1]

- Citation `HW-v5.3-p060-2`: valid (quote found on PDF page 60 (printed 60))
- Citation `HW-v5.3-p061-1`: valid (quote found on PDF page 61 (printed 61))
- Generation note: generation unavailable (Gemini unreachable: The read operation timed out)

### H05 - Which command enables internet access through RNDIS on the C16QS EVK?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1084 ms

> To access the internet through RNDIS on the C16QS EVK, the command AT$QCNETDEVCTL=3,1 must be sent to the module via the AT Port [EVK-v1.1-p020-1].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p020-1`: valid (quote found on PDF page 20 (printed 21))

### H06 - What is the maximum input voltage?

Status: **ambiguous** - mode `gemini:gemini-3.1-flash-lite (per scope)` - 2670 ms

> This depends on what you are powering. Bare module: The maximum input voltage for the VBAT_BB and VBAT_RF power supply pins on the C16QS module is 4.5V [HW-v5.3-p027-2]. EVK board: The provided passages do not specify the maximum input voltage for the C16QS EVK board. The documentation mentions that Jumper 3 allows switching between USB Type-C and a +5V Adapter as voltage sources, but it does not define a maximum input voltage limit.
>
> Clarifying question: Do you mean the bare C16QS module (VBAT) or the C16QS EVK board input?

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `HW-v5.3-p027-2`: valid (quote found on PDF page 27 (printed 27))
- Citation `EVK-v1.1-p012-1`: valid (quote found on PDF page 12 (printed 13))

### H07 - Does the C16QS have an eSIM?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 13567 ms

> The C16QS module is available with integrated eSIM options depending on the selected variant [WEB-snapshot-20261114-c81b8bc8-s27]. While some variants include an integrated eSIM, others do not [WEB-snapshot-20261114-c81b8bc8-s16]. Variants with the 'H' suffix in the variant code (e.g., GNAH or S00H) feature an integrated eSIM, whereas those with the 'N' suffix do not [WEB-snapshot-20261114-c81b8bc8-s16].

- Citation `WEB-snapshot-20261114-c81b8bc8-s16`: valid (quote found in re-extracted product page)
- Citation `WEB-snapshot-20261114-c81b8bc8-s27`: valid (quote found in re-extracted product page)

### H08 - Does the C16QS-NA support LTE Band 13?

Status: **conflict** - mode `structured band claims` - 45 ms

> Conflicting evidence for Band 13 on NA: listed in Cavli C16QS LTE CAT1.bis Module Hardware Manual 5.3 (pp. 12, 14, 54), but not listed in Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported). It is not treated as confirmed and is queued for expert review (item #3). Evidence: Cavli C16QS LTE CAT1.bis Module Hardware Manual 5.3 (p. 12): 2, 4, 5, 12, 13, 25, 66 [HW-v5.3-p012-2] \| Cavli C16QS LTE Cat 1bis IoT Module product page snapshot-20261114-c81b8bc8 (Technical Data > Cellular Bands Supported): 2, 4, 5, 12, 25, 66 [WEB-snapshot-20261114-c81b8bc8-s08]

- Review #3 (conflict): NA variant LTE band list differs (cross-source); disputed bands: 13. Do not treat any disputed band as confirmed.
- Citation `HW-v5.3-p012-2`: valid (quote found on PDF page 12 (printed 12))
- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))
- Citation `HW-v5.3-p054-2`: valid (quote found on PDF page 54 (printed 54))
- Citation `WEB-snapshot-20261114-c81b8bc8-s08`: valid (quote found in re-extracted product page)

### H09 - What is the MTBF of the C16QS module?

Status: **not_verified** - mode `coverage threshold` - 1 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### H10 - Is the C16QS certified on the Verizon network?

Status: **not_verified** - mode `coverage threshold` - 6 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.

