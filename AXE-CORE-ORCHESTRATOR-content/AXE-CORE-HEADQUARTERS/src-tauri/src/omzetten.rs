//! Bestanden omzetten vanuit de notch (Luka 20 nov, ronde 2: "slepen en
//! omzetten in any format, zoals Pulsar").
//!
//! Alleen met wat macOS zelf meebrengt -- niets installeren:
//!   afbeelding  sips        png, jpeg, heic, tiff, pdf, en "web" (jpeg, max 2000 px)
//!   document    textutil    txt, rtf, html, docx, odt; pdf via cupsfilter (alleen tekst)
//!   audio       afconvert   m4a (aac), wav, aiff
//!   video       avconvert   mp4, mov, m4a (alleen het geluid)
//!
//! Het origineel blijft altijd staan. De uitkomst komt ernaast; bestaat die
//! naam al, dan "naam (2).ext". Nooit iets overschrijven.

use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Soort {
    Afbeelding,
    Document,
    Audio,
    Video,
}

pub fn soort_van(pad: &Path) -> Option<Soort> {
    let ext = pad.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" | "jpg" | "jpeg" | "heic" | "heif" | "tif" | "tiff" | "gif" | "bmp" | "webp" => Soort::Afbeelding,
        "txt" | "rtf" | "rtfd" | "html" | "htm" | "doc" | "docx" | "odt" | "md" => Soort::Document,
        "mp3" | "m4a" | "wav" | "aif" | "aiff" | "caf" | "aac" | "flac" => Soort::Audio,
        "mov" | "mp4" | "m4v" => Soort::Video,
        _ => return None,
    })
}

/// Naar welke formaten dit kan. Leeg = niets.
pub fn doelen(soort: Soort) -> &'static [&'static str] {
    match soort {
        Soort::Afbeelding => &["png", "jpeg", "heic", "tiff", "pdf", "web"],
        Soort::Document => &["pdf", "docx", "txt", "rtf", "html", "odt"],
        Soort::Audio => &["m4a", "wav", "aiff"],
        Soort::Video => &["mp4", "mov", "m4a"],
    }
}

fn extensie(doel: &str) -> &str {
    match doel {
        "jpeg" | "web" => "jpg",
        other => other,
    }
}

/// Een vrije naam naast het origineel: "foto.png" -> "foto.jpg", of "foto (2).jpg".
pub fn vrije_naam(bron: &Path, ext: &str) -> PathBuf {
    let map = bron.parent().unwrap_or_else(|| Path::new("."));
    let stam = bron.file_stem().and_then(|s| s.to_str()).unwrap_or("bestand");
    let mut kandidaat = map.join(format!("{stam}.{ext}"));
    let mut n = 2;
    while kandidaat.exists() {
        kandidaat = map.join(format!("{stam} ({n}).{ext}"));
        n += 1;
    }
    kandidaat
}

fn draai(prog: &str, args: &[&str]) -> Result<(), String> {
    let uit = Command::new(prog).args(args).output().map_err(|e| format!("{prog}: {e}"))?;
    if uit.status.success() {
        Ok(())
    } else {
        Err(format!("{prog} failed: {}", String::from_utf8_lossy(&uit.stderr).trim().chars().take(200).collect::<String>()))
    }
}

pub fn zet_om(bron: &Path, doel: &str) -> Result<PathBuf, String> {
    if !bron.is_file() {
        return Err("file not found".into());
    }
    let soort = soort_van(bron).ok_or("this file type can't be converted")?;
    if !doelen(soort).contains(&doel) {
        return Err(format!("can't convert this to {doel}"));
    }
    let uit = vrije_naam(bron, extensie(doel));
    let b = bron.to_str().ok_or("path is not valid text")?;
    let u = uit.to_str().ok_or("path is not valid text")?;
    match soort {
        Soort::Afbeelding => {
            if doel == "web" {
                draai("/usr/bin/sips", &["-Z", "2000", "-s", "format", "jpeg", "-s", "formatOptions", "80", b, "--out", u])?
            } else {
                draai("/usr/bin/sips", &["-s", "format", doel, b, "--out", u])?
            }
        }
        Soort::Document => {
            if doel == "pdf" {
                // textutil kan geen pdf, en cupsfilter maakt alleen van platte
                // tekst een goede pdf (html en rtf gaven een leeg bestand,
                // gemeten 20 nov). Dus via tekst: de opmaak gaat verloren.
                let tmp = std::env::temp_dir().join(format!("axe-omzet-{}.txt", std::process::id()));
                let t = tmp.to_str().ok_or("temp path")?;
                draai("/usr/bin/textutil", &["-convert", "txt", b, "-output", t])?;
                let pdf = Command::new("/usr/sbin/cupsfilter").arg(t).output().map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(&tmp);
                if !pdf.status.success() || pdf.stdout.is_empty() {
                    return Err("cupsfilter could not make a pdf".into());
                }
                std::fs::write(&uit, &pdf.stdout).map_err(|e| e.to_string())?;
            } else {
                draai("/usr/bin/textutil", &["-convert", doel, b, "-output", u])?
            }
        }
        Soort::Audio => {
            let (f, d) = match doel {
                "m4a" => ("m4af", "aac"),
                "wav" => ("WAVE", "LEI16"),
                _ => ("AIFF", "BEI16"),
            };
            draai("/usr/bin/afconvert", &["-f", f, "-d", d, b, u])?
        }
        Soort::Video => {
            let preset = if doel == "m4a" { "PresetAppleM4A" } else { "PresetHighestQuality" };
            draai("/usr/bin/avconvert", &["--preset", preset, "--source", b, "--output", u])?
        }
    }
    if !uit.exists() {
        return Err("the converter made no file".into());
    }
    Ok(uit)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn soorten_en_doelen() {
        assert_eq!(soort_van(Path::new("a/Foto.HEIC")), Some(Soort::Afbeelding));
        assert_eq!(soort_van(Path::new("brief.docx")), Some(Soort::Document));
        assert_eq!(soort_van(Path::new("x.zip")), None);
        assert!(doelen(Soort::Video).contains(&"mp4"));
    }

    #[test]
    fn nooit_overschrijven() {
        let map = std::env::temp_dir().join(format!("axe-omzet-test-{}", std::process::id()));
        std::fs::create_dir_all(&map).unwrap();
        let bron = map.join("foto.png");
        std::fs::write(&bron, b"x").unwrap();
        assert_eq!(vrije_naam(&bron, "png"), map.join("foto (2).png"));
        assert_eq!(vrije_naam(&bron, "jpg"), map.join("foto.jpg"));
        let _ = std::fs::remove_dir_all(&map);
    }

    #[test]
    fn echte_omzetting_png_naar_jpeg() {
        if !Path::new("/usr/bin/sips").exists() {
            return;
        }
        let map = std::env::temp_dir().join(format!("axe-omzet-echt-{}", std::process::id()));
        std::fs::create_dir_all(&map).unwrap();
        let bron = map.join("pix.png");
        // 1x1 png
        let png: [u8; 67] = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
            0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D,
            0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        std::fs::write(&bron, png).unwrap();
        let uit = zet_om(&bron, "jpeg").unwrap();
        assert_eq!(uit, map.join("pix.jpg"));
        assert!(uit.exists() && bron.exists());
        let _ = std::fs::remove_dir_all(&map);
    }
}
