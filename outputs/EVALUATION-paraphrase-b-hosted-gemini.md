# Evaluation results: eval/paraphrase-b.json (hosted Worker https://cavli-assignment-2.nishanameenk.workers.dev, hybrid retrieval)

Run at 2026-11-15T09:40:31+00:00 UTC. 10/12 cases passed. 19/19 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| B01 | paraphrase | What voltage range can I feed the bare module from? | VBAT 3.1 V to 4.5 V, typical 3.8 V. | hardware-manual p. 13/20/27/28/60 | answered | HW 5.3 p. 28; HW 5.3 p. 27 | 2/2 valid | PASS | none | 3037 ms |
| B02 | paraphrase | How many UART ports does the module have? | Three: UART0, UART1 and UART2. | hardware-manual p. 13/33/34/35; product-page Interfaces/What interfaces | answered | HW 5.3 p. 33; HW 5.3 p. 33; HW 5.3 p. 34; HW 5.3 p. 35 | 4/4 valid | PASS | none | 17847 ms |
| B03 | paraphrase | Which pin do I pull low to switch the module on? | Pin 15, PWRKEY_N. | hardware-manual p. 30/22 | answered | HW 5.3 p. 30 | 1/1 valid | PASS | none | 1502 ms |
| B04 | paraphrase | What is the maximum upload speed? | Peak 5 Mbps uplink. | hardware-manual p. 14; product-page Speed | not_verified | none | n/a | FAIL | over_refusal | 755 ms |
| B05 | paraphrase | What SIM card voltages are supported? | USIM supports 3.0 V and 1.8 V. | hardware-manual p. 13/37/38 | answered | HW 5.3 p. 13; HW 5.3 p. 37; HW 5.3 p. 37 | 3/3 valid | PASS | none | 2032 ms |
| B06 | paraphrase | What processor runs inside the module and how fast is it? | ARM Cortex-M3 at 204 MHz. | hardware-manual p. 12/13; product-page Key Highlights | answered | HW 5.3 p. 12; HW 5.3 p. 13 | 2/2 valid | PASS | none | 1484 ms |
| B07 | paraphrase | Which light on the EVK shows that it has power? | The red Power Input LED next to the jumper. | evk-user-manual p. 18 | answered | EVK 1.1 p. 18, PDF page 17 | 1/1 valid | PASS | none | 1748 ms |
| B08 | paraphrase | How fast is the USB connection? | USB 2.0 high speed, up to 480 Mbps. | hardware-manual p. 13/33 | answered | HW 5.3 p. 33 | 1/1 valid | PASS | none | 1762 ms |
| B09 | paraphrase | How much humidity can the module tolerate? | RH 5% to 95%. | hardware-manual p. 14 | answered | HW 5.3 p. 14 | 1/1 valid | PASS | none | 2453 ms |
| B10 | paraphrase | How do I put the EVK into flight mode? | Jumper 9 (JMP 9) enables flight mode (W_Disable). | evk-user-manual p. 14 | answered | EVK 1.1 p. 14, PDF page 13; HW 5.3 p. 51 | 2/2 valid | PASS | none | 1635 ms |
| B11 | paraphrase | Which port gives out the GNSS location data? | UART2 carries GNSS NMEA data. | hardware-manual p. 13/35 | answered | HW 5.3 p. 52; HW 5.3 p. 35 | 2/2 valid | PASS | none | 2436 ms |
| B12 | paraphrase | Can the module send files over FTP? | Network protocols include FTP(S). | hardware-manual p. 14; at-command-manual  | not_verified | none | n/a | FAIL | over_refusal | 721 ms |

## Observed answers

### B01 - What voltage range can I feed the bare module from?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 3037 ms

> The power supply range for the Cavli C16QS module is between 3.1V and 4.5V [HW-v5.3-p028-1]. Specifically, the VBAT_BB and VBAT_RF pins have a minimum voltage of 3.1V, a typical voltage of 3.8V, and a maximum voltage of 4.5V [HW-v5.3-p027-2].

- Citation `HW-v5.3-p028-1`: valid (quote found on PDF page 28 (printed 28))
- Citation `HW-v5.3-p027-2`: valid (quote found on PDF page 27 (printed 27))

### B02 - How many UART ports does the module have?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 17847 ms

> The C16QS module provides three sets of UART interfaces [HW-v5.3-p033-2]. These include the UART0 serial port, which is used as the debug UART [HW-v5.3-p033-3], the UART1 serial port [HW-v5.3-p034-2], and the UART2 serial port, which is used to obtain GNSS NMEA data [HW-v5.3-p035-1].

- Citation `HW-v5.3-p033-2`: valid (quote found on PDF page 33 (printed 33))
- Citation `HW-v5.3-p033-3`: valid (quote found on PDF page 33 (printed 33))
- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p035-1`: valid (quote found on PDF page 35 (printed 35))

### B03 - Which pin do I pull low to switch the module on?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1502 ms

> The 15th pin of the C16QS module, labeled PWRKEY_N, is the power key. The module can be powered on by pulling the POWER_KEY low for at least 500ms.

- Citation `HW-v5.3-p030-3`: valid (quote found on PDF page 30 (printed 30))

### B04 - What is the maximum upload speed?

Status: **not_verified** - mode `coverage threshold` - 755 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### B05 - What SIM card voltages are supported?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2032 ms

> The Cavli C16QS module supports USIM card voltages of 1.8V and 3.0V [HW-v5.3-p013-1, HW-v5.3-p037-2]. Additionally, the hardware manual specifies support for 1.8V and 2.85V [HW-v5.3-p037-3].

- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))
- Citation `HW-v5.3-p037-2`: valid (quote found on PDF page 37 (printed 37))
- Citation `HW-v5.3-p037-3`: valid (quote found on PDF page 37 (printed 37))

### B06 - What processor runs inside the module and how fast is it?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1484 ms

> The C16QS module features an application subsystem that runs on a single ARM Cortex M3 processor [HW-v5.3-p012-2]. This processor operates at a clock frequency of 204MHz [HW-v5.3-p013-1].

- Citation `HW-v5.3-p012-2`: valid (quote found on PDF page 12 (printed 12))
- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))

### B07 - Which light on the EVK shows that it has power?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1748 ms

> The Power Input LED, which is red in color and located next to the JMP, indicates that the supply is connected to the power source when it turns ON. [EVK-v1.1-p017-1]

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p017-1`: valid (quote found on PDF page 17 (printed 18))

### B08 - How fast is the USB connection?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1762 ms

> The USB interface of the Cavli C16QS module supports high-speed (480Mbps) and full-speed (12Mbps) modes [HW-v5.3-p033-1].

- Citation `HW-v5.3-p033-1`: valid (quote found on PDF page 33 (printed 33))

### B09 - How much humidity can the module tolerate?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2453 ms

> The module supports a humidity range of RH5% to RH95% [HW-v5.3-p014-1].

- Citation `HW-v5.3-p014-1`: valid (quote found on PDF page 14 (printed 14))

### B10 - How do I put the EVK into flight mode?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1635 ms

> To enable Flight mode on the Cavli C16QS EVK, you must use Jumper 9 (JMP 9), which is designated for enabling Flight mode (W_Disable) [EVK-v1.1-p013-1]. Additionally, the module hardware features a W_DISABLE# pin (Pin 18) used to put the module into Flight mode and disable RF transmission [HW-v5.3-p051-2].

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p013-1`: valid (quote found on PDF page 13 (printed 14))
- Citation `HW-v5.3-p051-2`: valid (quote found on PDF page 51 (printed 51))

### B11 - Which port gives out the GNSS location data?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2436 ms

> The GNSS NMEA logs can be fetched using the GNSS_TXD and GNSS_RXD pins [HW-v5.3-p052-1]. Additionally, the module's UART2 serial port, located at pins 22 and 23, is used to obtain GNSS NMEA data [HW-v5.3-p035-1]. Note that UART2 and the GNSS UART are internally connected, so UART2 must be kept floating while using the GNSS interface and vice versa [HW-v5.3-p035-1].

- Citation `HW-v5.3-p052-1`: valid (quote found on PDF page 52 (printed 52))
- Citation `HW-v5.3-p035-1`: valid (quote found on PDF page 35 (printed 35))

### B12 - Can the module send files over FTP?

Status: **not_verified** - mode `coverage threshold` - 721 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.

