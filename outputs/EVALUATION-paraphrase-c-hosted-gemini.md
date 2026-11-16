# Evaluation results: eval/paraphrase-c.json (hosted Worker https://cavli-assignment-2.nishanameenk.workers.dev, hybrid retrieval)

Run at 2026-11-15T10:02:39+00:00 UTC. 15/16 cases passed. 18/18 citations (including related-context citations) were verified by re-extracting the cited page from the source file.

| ID | Type | Question | Expected behaviour | Expected source | Observed status | Cited locations | Citation validity | Result | Failure category | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| C01 | paraphrase | How many general-purpose I/O lines does the module give me? | 4 GPIO interfaces. | hardware-manual p. 13/39; product-page Interfaces | answered | HW 5.3 p. 13; HW 5.3 p. 39 | 2/2 valid | PASS | none | 4993 ms |
| C02 | paraphrase | How fast does the I2C bus run? | Clock rate of 400 kHz (high-speed mode up to 3.3 Mbps is also stated). | hardware-manual p. 43/13 | answered | HW 5.3 p. 43; HW 5.3 p. 13 | 2/2 valid | PASS | none | 3018 ms |
| C03 | paraphrase | How much current does the GPS part use while tracking satellites? | GNSS tracking 60 mA (Table 5.5). | hardware-manual p. 61 | not_verified | none | n/a | FAIL | over_refusal | 837 ms |
| C04 | paraphrase | How many modules come on one reel? | SPQ 500 per tape and reel. | hardware-manual p. 67/68/69/70 | answered | HW 5.3 p. 69 | 1/1 valid | PASS | none | 1939 ms |
| C05 | paraphrase | What impedance should my antenna feed line be designed for? | 50 ohm characteristic impedance. | hardware-manual p. 14/45/46/50/56 | answered | HW 5.3 p. 47; HW 5.3 p. 45 | 2/2 valid | PASS | none | 3209 ms |
| C06 | paraphrase | What reference voltage does the module put out for level shifting? | VDD_EXT, a 1.8 V output (pin 29). | hardware-manual p. 23/27/29/30/36 | answered | HW 5.3 p. 29; HW 5.3 p. 30 | 2/2 valid | PASS | none | 1700 ms |
| C07 | paraphrase | Which serial port outputs the debug logs? | UART0 carries DM (debug/logging) data. | hardware-manual p. 13/33/34 | answered | HW 5.3 p. 33; HW 5.3 p. 34; HW 5.3 p. 35 | 3/3 valid | PASS | none | 1779 ms |
| C08 | paraphrase | What is the highest voltage I can put on the ADC pins? | The ADC input voltage cannot exceed VBAT. | hardware-manual p. 44 | answered | HW 5.3 p. 44 | 1/1 valid | PASS | none | 1983 ms |
| C09 | paraphrase | How much current does the module draw in its second sleep level? | Sleep 2: 25 µA. | hardware-manual p. 61 | answered | HW 5.3 p. 61 | 1/1 valid | PASS | none | 1856 ms |
| C10 | paraphrase | Does the module need separate antennas for cellular and GPS? | Yes: one main antenna and one GNSS antenna interface. | hardware-manual p. 14/45/51/52/54/56; product-page Interfaces | answered | HW 5.3 p. 45; HW 5.3 p. 46 | 2/2 valid | PASS | none | 2158 ms |
| C11 | unanswerable | What warranty period does Cavli give on the C16QS? | Not verified: no warranty period is stated (only a copyright disclaimer). | none (no source should support an answer) | not_verified | none \| related: EVK 1.1 p. 3, PDF page 2; HW 5.3 p. 2 | 2/2 valid | PASS | none | 1868 ms |
| C12 | unanswerable | How much does the C16QS weigh? | Not verified: no weight is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 863 ms |
| C13 | unanswerable | What is the lead time for ordering 5,000 C16QS modules? | Not verified: no lead time is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1753 ms |
| C14 | unanswerable | Is the C16QS certified for use on the AT&T network? | Not verified: no carrier certification is stated (FCC text is not carrier approval). | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1948 ms |
| C15 | unanswerable | What IP rating does the C16QS have against dust and water? | Not verified: no IP rating is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 657 ms |
| C16 | unanswerable | What is the maximum altitude the module can operate at? | Not verified: no altitude limit is stated. | none (no source should support an answer) | not_verified | none | n/a | PASS | none | 1563 ms |

## Observed answers

### C01 - How many general-purpose I/O lines does the module give me?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 4993 ms

> The C16QS module contains four general purpose GPIO interfaces [HW-v5.3-p013-1]. These consist of four general purpose control signals, specifically GPIO1, GPIO7, AGPIO5, and AGPIO7 [HW-v5.3-p039-1].

- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))
- Citation `HW-v5.3-p039-1`: valid (quote found on PDF page 39 (printed 39))

### C02 - How fast does the I2C bus run?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 3018 ms

> The C16QS module provides an I2C interface with a clock rate of 400 KHz [HW-v5.3-p043-1]. Additionally, the module's key features table states that the I2C interface is compliant with the I2C bus protocol and that high speed mode supports a 3.3Mbps rate [HW-v5.3-p013-1].

- Citation `HW-v5.3-p043-1`: valid (quote found on PDF page 43 (printed 43))
- Citation `HW-v5.3-p013-1`: valid (quote found on PDF page 13 (printed 13))

### C03 - How much current does the GPS part use while tracking satellites?

Status: **not_verified** - mode `coverage threshold` - 837 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C04 - How many modules come on one reel?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1939 ms

> The C16QS module is packaged in a tape reel with 500 pcs per reel. [HW-v5.3-p069-3]

- Citation `HW-v5.3-p069-3`: valid (quote found on PDF page 69 (printed 69))

### C05 - What impedance should my antenna feed line be designed for?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 3209 ms

> The characteristic impedance of the antenna feed line (signal line) must be controlled at 50Ω [HW-v5.3-p047-2]. Both the main antenna interface (pin 60) and the GNSS antenna interface (pin 49) require a 50-ohm impedance line [HW-v5.3-p045-1].

- Citation `HW-v5.3-p047-2`: valid (quote found on PDF page 47 (printed 47))
- Citation `HW-v5.3-p045-1`: valid (quote found on PDF page 45 (printed 45))

### C06 - What reference voltage does the module put out for level shifting?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1700 ms

> The C16QS module outputs 1.8V through the VDD_EXT pin (pin 29), which serves as the reference voltage and logic level voltage for the module [HW-v5.3-p029-3, HW-v5.3-p030-3]. This voltage can be used as an external power supply for components such as a level shifting chip, provided the maximum load remains within 50mA [HW-v5.3-p029-3].

- Citation `HW-v5.3-p029-3`: valid (quote found on PDF page 29 (printed 29))
- Citation `HW-v5.3-p030-3`: valid (quote found on PDF page 30 (printed 30))

### C07 - Which serial port outputs the debug logs?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1779 ms

> The UART0 serial interface can only be used as the debug UART of the module [HW-v5.3-p033-3]. Additionally, the UART1 serial port can be used to print program log information [HW-v5.3-p034-2, HW-v5.3-p035-2].

- Citation `HW-v5.3-p033-3`: valid (quote found on PDF page 33 (printed 33))
- Citation `HW-v5.3-p034-2`: valid (quote found on PDF page 34 (printed 34))
- Citation `HW-v5.3-p035-2`: valid (quote found on PDF page 35 (printed 35))

### C08 - What is the highest voltage I can put on the ADC pins?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1983 ms

> The ADC interface input voltage cannot exceed VBAT [HW-v5.3-p044-2]. Additionally, the ADC pin definitions specify a maximum voltage of 3.4 V [HW-v5.3-p044-2].

- Citation `HW-v5.3-p044-2`: valid (quote found on PDF page 44 (printed 44))

### C09 - How much current does the module draw in its second sleep level?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 1856 ms

> The C16QS module draws 25 µA of current in the Sleep 2 state [HW-v5.3-p061-1].

- Citation `HW-v5.3-p061-1`: valid (quote found on PDF page 61 (printed 61))

### C10 - Does the module need separate antennas for cellular and GPS?

Status: **answered** - mode `gemini:gemini-3.1-flash-lite` - 2158 ms

> Yes, the C16QS module provides two separate antenna interfaces: a main set antenna interface (pin 60) for CAT.1bis signals and a dedicated GNSS antenna interface (pin 49) for GPS and BEIDOU [HW-v5.3-p045-1]. The GNSS antenna must maintain a certain distance from the main antenna [HW-v5.3-p046-1]. Both interfaces have a 50-ohm characteristic impedance [HW-v5.3-p045-1].

- Citation `HW-v5.3-p045-1`: valid (quote found on PDF page 45 (printed 45))
- Citation `HW-v5.3-p046-1`: valid (quote found on PDF page 46 (printed 46))

### C11 - What warranty period does Cavli give on the C16QS?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1868 ms

> Not verified in the available C16QS sources. The provided documents do not contain information regarding the warranty period for the Cavli C16QS module. The hardware and user manuals explicitly state that the information provided in those documents does not constitute a warranty of any kind, express or implied.

- Review #6 (outdated_reference): Cavli C16QS EVK User Manual (Connection Manual) 1.1 (2023-03-07) is based on an unversioned 'Hardware Manual' but the current Cavli C16QS LTE CAT1.bis Module Hardware Manual is 5.3 (2024-12-07). Module statements in it may be outdated.
- Citation `EVK-v1.1-p002-2`: valid (quote found on PDF page 2 (printed 3))
- Citation `HW-v5.3-p002-1`: valid (quote found on PDF page 2 (printed 2))

### C12 - How much does the C16QS weigh?

Status: **not_verified** - mode `coverage threshold` - 863 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C13 - What is the lead time for ordering 5,000 C16QS modules?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1753 ms

> Not verified in the available C16QS sources. The provided documentation does not contain information regarding the lead time for ordering 5,000 C16QS modules.


### C14 - Is the C16QS certified for use on the AT&T network?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1948 ms

> Not verified in the available C16QS sources. The provided passages do not contain information regarding whether the C16QS module is certified for use on the AT&T network.


### C15 - What IP rating does the C16QS have against dust and water?

Status: **not_verified** - mode `coverage threshold` - 657 ms

> Not verified in the available C16QS sources. The closest passages do not cover the question's key terms.


### C16 - What is the maximum altitude the module can operate at?

Status: **not_verified** - mode `gemini:gemini-3.1-flash-lite` - 1563 ms

> Not verified in the available C16QS sources. The provided documentation does not contain information regarding the maximum altitude at which the module can operate.

