#Requires AutoHotkey v2.0
; ============================================================================
;  Jarvis Global Hotkey (Windows / AutoHotkey v2)
; ============================================================================
;
;  Appuie Ctrl+Alt+J n'importe ou sur ton bureau -> ouvre / focus la CRM
;  + declenche la dictee vocale Jarvis (Ctrl+Shift+V envoye dans le browser).
;
;  Installation (5 min) :
;    1. Telecharger AutoHotkey v2 : https://www.autohotkey.com/ (bouton
;       "Download v2.0"). Installer en mode utilisateur.
;    2. Modifier CRM_URL ci-dessous avec l'URL prod (ex. https://mooncrm.fr).
;    3. Double-cliquer sur ce fichier .ahk -> une icone "H" verte apparait
;       dans la barre des taches. Le hotkey est actif.
;    4. (Optionnel - lance le script au demarrage Windows) :
;       Win+R -> taper "shell:startup" -> Entree -> deposer un raccourci
;       de ce .ahk dans le dossier qui s'ouvre.
;
;  Raccourcis :
;    Ctrl+Alt+J    : Ouvre / focus la CRM + lance la dictee vocale.
;    Ctrl+Alt+M    : Ouvre / focus la CRM sans declencher la dictee
;                    (utile pour aller juste consulter quelque chose).
;
;  Personnalisation :
;    - Pour changer le raccourci : remplace ^!j ou ^!m par autre chose.
;      ^=Ctrl, !=Alt, +=Shift, #=Win. Ex. "#j::" pour Win+J.
;    - Si Chrome n'est pas ton browser par defaut : remplace Run CRM_URL par
;      Run '"C:\Program Files\Google\Chrome\Application\chrome.exe" ' CRM_URL
; ============================================================================

; ----- Config (pre-rempli pour Benjamin / MOON Expertise)
CRM_URL := "https://crm.moonexpertise.fr/"   ; URL prod (domaine custom)
WINDOW_HINT := "MOON Expertise"               ; le title des onglets est "CRM | MOON Expertise"

; ----- Match partiel sur les titres de fenetre (sinon il faudrait le titre exact)
SetTitleMatchMode 2

; ----- Helpers
FocusOrOpenCRM() {
    global CRM_URL, WINDOW_HINT
    if WinExist(WINDOW_HINT) {
        WinActivate
        Sleep 150
        return false  ; pas ouvert : juste focus
    }
    Run CRM_URL
    ; Attends que la fenetre apparaisse + la page se charge un peu
    WinWait WINDOW_HINT, , 8
    if !WinExist(WINDOW_HINT) {
        ; Browser pas encore pret -> fallback : on attend juste 2s
        Sleep 2000
    } else {
        WinActivate
        Sleep 800   ; le temps que la page hydrate et que Ctrl+Shift+V soit ecoute
    }
    return true
}

; ----- Hotkeys
;
;  ^!j (Ctrl+Alt+J) = push-to-talk :
;    - HOLD -> envoie Ctrl+Shift+V (START enregistrement vocal cote app)
;    - RELEASE -> envoie Ctrl+Shift+B (STOP + envoie la requete)
;
;  KeyWait "j" bloque le script jusqu'au release physique de la touche J.
;  Pendant ce temps Windows continue normalement et le browser enregistre
;  ta voix. Quand tu laches, on envoie le signal de stop+send.
^!j::
{
    FocusOrOpenCRM()
    Sleep 100
    SendInput "^+v"   ; START : declenche l'ecoute vocale Jarvis
    KeyWait "j"        ; bloque tant que J n'est pas relachee
    SendInput "^+b"   ; STOP + SEND : envoie la requete vocale a l'IA
}

^!m::  ; Ctrl+Alt+M : ouvre CRM sans dictee
{
    FocusOrOpenCRM()
}
