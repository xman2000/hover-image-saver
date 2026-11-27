# Hover Image Saver

A small Firefox add-on: hover over an image, click the button, and it's saved to your folder. No dialogs, no menus.

- **One click to save.** A button appears on images when you hover over them.
- **A folder per site.** Click the toolbar button on any site to choose where that site's images go.
- **Any folder on Windows.** Save to full paths like `C:\Images\Wallpapers` or `\\nas\photos` with an optional helper program (see below). Without it, images go to folders inside your Firefox download folder.
- **Skip thumbnails.** Only show the button on images above a minimum resolution.
- **Make the button yours.** Choose its corner, size and distance from the edges.
- **Private.** No tracking, no data collection, no network requests of its own.

## Install

Install it from [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/hover-image-saver/).

**Private windows:** go to `about:addons` → Hover Image Saver → Details, and set **Run in Private Windows** to **Allow**.

## Using it

- **Save an image:** hover over it and click the button. It turns green when the image is saved, or red if something went wrong (hover over it to see why).
- **Set a folder for a site:** while you're on the site, click the Hover Image Saver toolbar button. The popup shows where that site's images currently go.
- **Everything else:** `about:addons` → Hover Image Saver → Options. There you can set your default folder, the button's corner, size and offsets, the thumbnail filter, and see or remove site folders.

Folders can be:

| You type | Images are saved to |
| --- | --- |
| `Saved Images` | `Saved Images` inside your Firefox download folder |
| `Photos/Cats` | `Photos\Cats` inside your Firefox download folder |
| *(empty)* | Your Firefox download folder |
| `C:\Images\Cats` | That exact folder *(needs the helper)* |
| `\\nas\photos` | That network folder *(needs the helper)* |

## Saving to any folder (Windows)

Firefox only lets add-ons save inside your download folder. To save anywhere else, install the small helper program. It's a PowerShell script that comes with this project; nothing else needs installing.

Here's what it does: Firefox downloads the image to a temporary folder inside your download folder, then the helper moves it to your chosen folder. The helper can only be used by this add-on, and it only moves files out of that temporary folder.

1. Download `hover-image-saver-helper.zip` from the [latest release](https://github.com/xman2000/hover-image-saver/releases/latest).
2. Extract it somewhere permanent, for example `C:\Tools\hover-image-saver-helper`. Don't run it from your Downloads folder, because Firefox needs it to stay where it is.
3. Open PowerShell and run (adjust the path):
   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Tools\hover-image-saver-helper\install.ps1"
   ```
4. Restart Firefox.

The installer adds one entry under `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts` (your user account only, no admin rights needed) so Firefox can find the helper.

If you move the folder, run `install.ps1` again. To remove the helper:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Tools\hover-image-saver-helper\install.ps1" -Uninstall
```

then delete the folder.

## Privacy

Hover Image Saver doesn't collect, store or send any data. Your settings (folders, button options) stay in Firefox on your computer. The only network request it makes is the image download you ask for, which goes through Firefox's normal downloads.

## Project layout

- `image-saver/`: the Firefox add-on
- `native-host/`: the optional Windows helper for full folder paths

To try a development copy, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `image-saver/manifest.json`.

## License

[MIT](LICENSE)
