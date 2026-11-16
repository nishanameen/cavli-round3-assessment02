# Builds outputs/Cavli_A02_hosted_demo.mp4 from frames captured on the live site (web/scripts/capture-hosted-demo.mjs)
# plus Windows TTS narration. Requires ffmpeg/ffprobe on PATH. Run from round3-assignment2.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$chapters = @(
  'This is the hosted version of the C sixteen Q S documentation intelligence prototype. It runs as a Cloudflare Worker behind a reviewer login. It answers questions from four public sources: the hardware manual, release five point three; the evaluation kit manual; the A T command manual; and the official product page. Suggested questions are grouped by case type: answerable, ambiguous, conflicting, not answerable, and a simulated revision. The switch at the top changes between the current sources and a clearly labelled simulated revision.',
  'Here I ask which pin resets the bare module. The answer, pin seventeen pulled low for one hundred to five hundred milliseconds, is written by Gemini three point one flash lite using only the retrieved passages. Each numbered citation shows the document, the revision and whether it is current, the printed page and section, and the exact quoted passage. The link opens the public P D F at that page. The review flag notes that the A T plus T R B command mentioned on this page is missing from the A T manual.',
  'Every answer can be audited. This panel lists the passages retrieved from the Supabase database, with their rerank score and keyword coverage, and the validator result. The validator rejects any answer that cites a passage that was not retrieved, or that contains a number missing from the cited text. When that happens, the system falls back to quoting the passages directly.',
  'Supply voltage means different things for the bare module and for the evaluation board, so this answer is marked ambiguous. It answers both scopes separately, each with its own citations, and asks which one you meant. The module figures come from the hardware manual, and the board options come from the evaluation kit manual.',
  'Does the worldwide variant support band thirty eight? The hardware manual lists it on three pages, but the product page leaves it out. Both sources give bands per regional variant, so this is a genuine conflict at the same scope. The system shows both sources, does not confirm the band, and links review item four. Band answers come from structured band lists, never from the language model.',
  'Some questions cannot be answered from these documents. Certification for a custom antenna is a decision for Cavli and a certification lab, so the answer is not verified in the available sources. Related F C C passages are shown only as context, together with an escalation route to Cavli support.',
  'Now the simulated view. A labelled simulated revision five point four of the hardware manual changes the reset pulse to one hundred fifty to five hundred milliseconds. The answer cites the simulated revision with a clear badge, warns that it is not a Cavli publication, shows the previous five point three wording, and links the revision change review item.',
  'The review queue lists everything the ingest checks found. This revision change item shows a line level difference of what changed on page thirty one. Nothing is corrected automatically. An expert resolves an item with a short note, and that resolution survives when the index is published again.',
  'In the current view there are six open items. The worldwide conflict shows each source and page, with the disputed bands thirteen and thirty eight in bold. The other items cover the E A J and N A band lists, the L A list that varies inside the manual itself, the undocumented A T command, and an older evaluation kit reference.',
  'The sources tab shows every indexed revision, with its host, where the date came from, how the file was obtained, and its file and text hashes. The data lives in its own schema in Supabase, reached only through a token checked function, and the Worker keeps its keys as secrets. On the live site, all fourteen evaluation cases and all ten held out questions passed, every citation was checked again against the source pages, and a Playwright browser test passed sixteen of sixteen checks.'
)
$folder = Join-Path (Get-Location) 'outputs/demo-hosted/build'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$synth.Rate = -1
$clips = @()
try {
  for ($i = 0; $i -lt $chapters.Count; $i++) {
    $n = '{0:D2}' -f ($i + 1)
    $wav = Join-Path $folder "$n.wav"
    $clip = Join-Path $folder "$n.mp4"
    $synth.SetOutputToWaveFile($wav)
    $synth.Speak($chapters[$i])
    $synth.SetOutputToNull()
    $seconds = [double](& ffprobe -v error -show_entries format=duration -of csv=p=0 $wav) + 2.5
    & ffmpeg -loglevel error -y -loop 1 -framerate 5 -i "outputs/demo-hosted/frames/$n.png" -i $wav `
      -af "apad=whole_dur=$seconds" -t $seconds -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 96k $clip
    if ($LASTEXITCODE -ne 0) { throw "Could not render chapter $n" }
    $clips += "file '$n.mp4'"
  }
} finally { $synth.Dispose() }
$list = Join-Path $folder 'clips.txt'
Set-Content -LiteralPath $list -Value $clips -Encoding ascii
& ffmpeg -loglevel error -y -f concat -safe 0 -i $list -c copy -movflags +faststart outputs/Cavli_A02_hosted_demo.mp4
if ($LASTEXITCODE -ne 0) { throw 'Could not assemble demo' }
& ffprobe -v error -show_entries format=duration,size -of default=nw=1 outputs/Cavli_A02_hosted_demo.mp4
