# Evaluation results: eval/paraphrase.json (hosted Worker https://cavli-assignment-2.nishanameenk.workers.dev, hybrid retrieval)

Run at 2026-11-15T09:41:22+00:00 UTC. 6/14 cases passed. 20/20 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| P01 | paraphrase | How hot can the module get while it is working? | Normal operating range up to +85 °C (Table 2.1 / Table 5.1). | hardware-manual p. 14/58 | not_verified | none | n/a | FAIL | over_refusal | 792 ms |
| P02 | paraphrase | What is the thickness of the C16QS? | 2.3 mm (26.5 x 22.5 x 2.3 mm). | hardware-manual p. 13; product-page Packaging | not_verified | none \| related: HW 5.3 p. 71; HW 5.3 p. 67 | 2/2 valid | FAIL | retrieval_miss | 2256 ms |
| P03 | paraphrase | Which serial port carries the AT commands on the module? | UART1 carries AT commands and data. | hardware-manual p. 13/34/35 | answered | HW 5.3 p. 34; HW 5.3 p. 35 | 2/2 valid | PASS | none | 1694 ms |
| P04 | paraphrase | How do I reboot the module if it freezes? | Pull the reset pin (pin 17) low for 100-500 ms, or use a restart command. | hardware-manual p. 31; at-command-manual p. 193 | not_verified | none | n/a | FAIL | over_refusal | 895 ms |
| P05 | paraphrase | What is the lowest current the module can draw? | Shutdown 1 µA (Hibernate 11 µA), Table 5.5. | hardware-manual p. 61 | not_verified | none | n/a | FAIL | over_refusal | 633 ms |
| P06 | paraphrase | How do I switch the EVK between USB power and a wall adapter? | Use jumper JMP 3 (power input jumper). | evk-user-manual p. 11/13/17 | answered | EVK 1.1 p. 13, PDF page 12; EVK 1.1 p. 17, PDF page 16 | 2/2 valid | PASS | none | 1973 ms |
| P07 | paraphrase | How fast can it download data? | Peak 10 Mbps downlink (LTE Cat 1bis). | hardware-manual p. 14; product-page Speed | answered | Web 20261114-c81b8bc8 Technical Data > Cellular Connectivity Download & Uplink Speed (* Peak Values) | 1/1 valid | PASS | none | 1849 ms |
| P08 | paraphrase | Can the module find its location with satellites? | Optional GNSS with GPS and BeiDou (GNSS variants). | hardware-manual p. 13/51/52/55; product-page GNSS/Location/Key Highlights/C16QS LTE Cat 1bis IoT Module | not_verified | none | n/a | FAIL | over_refusal | 682 ms |
| P09 | paraphrase | How big is the module? | 26.5 mm x 22.5 mm x 2.3 mm. | hardware-manual p. 13; product-page Packaging | not_verified | none \| related: HW 5.3 p. 62; HW 5.3 p. 63; HW 5.3 p. 64 | 3/3 valid | FAIL | retrieval_miss | 1823 ms |
| P10 | paraphrase | How can I tell that the module has joined the mobile network? | Network status indication pin/LED (NET_STATUS); on the EVK the NETLIGHT LED. | hardware-manual p. 39/40; evk-user-manual p. 19 | answered | HW 5.3 p. 40; AT 3.1 p. 39; EVK 1.1 p. 19, PDF page 18 | 3/3 valid | PASS | none | 6550 ms |
| P11 | paraphrase | What is the default speed of the AT serial port? | 115200 bps. | hardware-manual p. 13/34/35 | answered | HW 5.3 p. 34; HW 5.3 p. 35; AT 3.1 p. 204; HW 5.3 p. 13 | 4/4 valid | PASS | none | 2061 ms |
| P12 | paraphrase | Which button on the dev board restarts the module? | The Reset Key (C16QS) on the EVK. | evk-user-manual p. 13/18 | not_verified | none | n/a | FAIL | over_refusal | 1106 ms |
| P13 | paraphrase | How much current does the module pull at its highest transmit load? | Module peak 650.88 mA (Table 5.5). | hardware-manual p. 60/61 | not_verified | none \| related: HW 5.3 p. 28 | 1/1 valid | FAIL | retrieval_miss | 4276 ms |
| P14 | paraphrase | What is the coldest temperature the module can be stored at? | -45 °C storage. | hardware-manual p. 14/58 | answered | HW 5.3 p. 58; HW 5.3 p. 14 | 2/2 valid | PASS | none | 7495 ms |

## Observed answers

### P01 - How hot can the module get while it is working?

Status: **not_verified** - mode `coverage threshold` - 792 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### P02 - What is the thickness of the C16QS?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 2256 ms

> Not verified in the available C16QS sources. The provided passages do not contain information regarding the physical thickness of the C16QS module. The documents mention a recommended stencil thickness of 0.18 mm for the pad portion [HW-v5.3-p071-1] and tape width tolerances for packaging [HW-v5.3-p067-1], but not the module's own thickness.

- Citation `HW-v5.3-p071-1`: valid (quote found on PDF page 71 (printed 71))
- Citation `HW-v5.3-p067-1`: valid (quote found on PDF page 67 (printed 67))

### P03 - Which serial port carries the AT commands on the module?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1694 ms

> The UART1 serial port is used to realize AT interactive instructions [HW-v5.3-p034-2], [HW-v5.3-p035-2].

- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p035-2`: valid (quote found on PDF page 35 (printed 35))

### P04 - How do I reboot the module if it freezes?

Status: **not_verified** - mode `coverage threshold` - 895 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.

- Review #5 (cross_reference_gap): AT+TRB is referenced in Cavli C16QS LTE CAT1.bis Module Hardware Manual (rev 5.3, page 31) but is not documented in the current AT Command Manual.
- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.

### P05 - What is the lowest current the module can draw?

Status: **not_verified** - mode `coverage threshold` - 633 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### P06 - How do I switch the EVK between USB power and a wall adapter?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1973 ms

> To switch the EVK between power sources, use Jumper 3 (JMP 3) [EVK-v1.1-p012-1]. Placing the jumper in the first position enables USB Type-C as the input voltage source, while the second position enables the +5V Adapter as the voltage source [EVK-v1.1-p012-1]. You must place the Power Input Jumper (JMP 3) according to the input power supply being used [EVK-v1.1-p016-1].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p012-1`: valid (quote found on PDF page 12 (printed 13))
- Citation `EVK-v1.1-p016-1`: valid (quote found on PDF page 16 (printed 17))

### P07 - How fast can it download data?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1849 ms

> The Cavli C16QS LTE Cat 1bis module supports a peak download speed of 10Mbps [WEB-snapshot-20261114-c81b8bc8-s11].

- Citation `WEB-snapshot-20261114-c81b8bc8-s11`: valid (quote found in re-extracted product page)

### P08 - Can the module find its location with satellites?

Status: **not_verified** - mode `coverage threshold` - 682 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### P09 - How big is the module?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1823 ms

> Not verified in the available C16QS sources. The provided passages mention the module mechanical size and include figures for the module's dimensions, but they do not explicitly state the numerical length, width, or height values of the module.

- Citation `HW-v5.3-p062-2`: valid (quote found on PDF page 62 (printed 62))
- Citation `HW-v5.3-p063-1`: valid (quote found on PDF page 63 (printed 63))
- Citation `HW-v5.3-p064-1`: valid (quote found on PDF page 64 (printed 64))

### P10 - How can I tell that the module has joined the mobile network?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 6550 ms

> You can determine if the module has joined the mobile network using the NET_STATUS pin (pin 21 or 75) or AT commands. When the module is latched on to the network, the network indicator LED will be constantly bright [HW-v5.3-p040-1]. Alternatively, you can enable network registration unsolicited result codes using the AT+CEREG command to monitor the registration status [AT-v3.1-p039-1]. Once RF functionality is enabled via AT+CFUN=1, the NETLIGHT will transition from blinking while searching to stable when latched on to the network [EVK-v1.1-p018-1].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `HW-v5.3-p040-1`: valid (quote found on PDF page 40 (printed 40))
- Citation `AT-v3.1-p039-1`: valid (quote found on PDF page 39 (printed 39))
- Citation `EVK-v1.1-p018-1`: valid (quote found on PDF page 18 (printed 19))

### P11 - What is the default speed of the AT serial port?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2061 ms

> The default baud rate for the AT serial port is 115200 bps [HW-v5.3-p034-2], [HW-v5.3-p035-2], [AT-v3.1-p204-2], [HW-v5.3-p013-1].

- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p035-2`: valid (quote found on PDF page 35 (printed 35))
- Citation `AT-v3.1-p204-2`: valid (quote found on PDF page 204 (printed 204))
- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))

### P12 - Which button on the dev board restarts the module?

Status: **not_verified** - mode `coverage threshold` - 1106 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.

### P13 - How much current does the module pull at its highest transmit load?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 4276 ms

> Not verified in the available C16QS sources. The provided passages do not specify the exact current draw of the module at its highest transmit load. While the hardware manual recommends using a 3.8 V/830 mA power supply, it does not explicitly state the module's peak current consumption during transmission [HW-v5.3-p028-1].

- Citation `HW-v5.3-p028-1`: valid (quote found on PDF page 28 (printed 28))

### P14 - What is the coldest temperature the module can be stored at?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 7495 ms

> The coldest temperature the module can be stored at is -45°C [HW-v5.3-p058-4, HW-v5.3-p014-1].

- Citation `HW-v5.3-p058-4`: valid (quote found on PDF page 58 (printed 58))
- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))
