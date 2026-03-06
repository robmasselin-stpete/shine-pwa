# Enhancing Bios with Claude

Use Claude to rewrite and improve mural bios from detail card data and web research.

## Finding Murals That Need Enhancement

```bash
python3 scripts/build-data.py --list-stale
```

This shows all murals still marked `source: "legacy"` — meaning they haven't been verified or enhanced.

## Step-by-Step

### 1. Pick a mural YAML file

Open it and copy the contents. For example:
```yaml
artist: "Aaron Tullo"
year: 2025
artistBio: "Aaron Tullo is a muralist..."
muralDescription: ""
```

### 2. Paste into Claude with a prompt

> Here is the YAML file for this mural. Using the attached detail card PDF (if available) and any public information, please:
>
> 1. Write an enhanced `artistBio` (3-5 sentences covering their background, artistic style, and notable works or exhibitions)
> 2. Write a `muralDescription` (2-3 sentences describing what the mural depicts — colors, subjects, style)
> 3. Fill in `basedIn` if missing
> 4. Return the complete updated YAML file
>
> Keep the tone informative but engaging. Avoid promotional language.

If you have the detail card PDF, attach it to the conversation.

### 3. Review Claude's output

- Verify facts (exhibition names, dates, awards)
- Check that GPS and address weren't changed
- Make sure the bio sounds natural, not AI-generic

### 4. Update the YAML file

Copy the enhanced fields back into the YAML file. Update provenance:

```yaml
source: "claude-enhanced"
sourceNotes: "Bio rewritten from detail card + web research, 2026-03-05"
```

### 5. Build and test

```bash
python3 scripts/build-data.py
python3 -m http.server 8080
# Check the mural's detail page
```

## Batch Enhancement Tips

- Process 5-10 murals per session for quality
- Group by year — artists from the same festival often have similar detail card formats
- Always verify at least one fact from each enhanced bio
- If Claude makes something up, note it in `sourceNotes`

## Example Prompt for Multiple Murals

> I have 5 mural YAML files to enhance. For each one, please write an improved artistBio and muralDescription. Return each as a complete YAML file I can paste back.
>
> [paste YAML files separated by ---]

## Quality Checklist

- [ ] Bio is 3-5 sentences, not just one line
- [ ] muralDescription describes what you'd actually see
- [ ] No fabricated awards or exhibitions
- [ ] basedIn is filled in
- [ ] source updated to "claude-enhanced"
- [ ] Builds without errors
