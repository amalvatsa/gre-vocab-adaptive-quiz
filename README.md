# GRE Vocab Adaptive Quiz (Lists 1-14)

Interactive GRE vocab quiz app built from all PDFs in this folder.

## Features

- Adaptive quiz: words you miss are pushed back with higher probability.
- Randomized test flow with spaced repetition for stuck words.
- Modes:
  - `Word -> Meaning Group`
  - `Meaning Group -> Word`
  - `Mixed`
- Choose any list subset (`List 1` to `List 14`) or all at once.
- "Focus only on stuck words" mode.
- Session summary with most-missed words.
- iPhone-friendly PWA support (Add to Home Screen).

## Local run

```bash
cd '/Users/amalvatsa/Desktop/GRE VOCAB'
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Online deploy (Vercel)

Preview deploy:

```bash
vercel deploy '/Users/amalvatsa/Desktop/GRE VOCAB' -y
```

Production deploy:

```bash
vercel deploy '/Users/amalvatsa/Desktop/GRE VOCAB' --prod -y
```
