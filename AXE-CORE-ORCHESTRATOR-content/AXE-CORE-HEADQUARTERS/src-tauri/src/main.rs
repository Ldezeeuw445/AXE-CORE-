// Desktop-instappunt. Alle app-logica leeft in de library (lib.rs), zodat
// mobiel (Android/iOS) dezelfde run() kan aanroepen via de mobile-entry-point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    axe_core_lib::run()
}
