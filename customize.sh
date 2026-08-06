DATADIR=/data/adb/airgap
CONFIG="$DATADIR/isolated.json"

mkdir -p "$DATADIR/backups"
chmod 700 "$DATADIR"

if [ ! -s "$CONFIG" ]; then
	echo "[]" >"$CONFIG"
else
	ui_print "- Keeping $(tr -cd ',' <"$CONFIG" | wc -c | awk '{print $1+1}') isolated app(s)"
fi
chmod 600 "$CONFIG"

# capabilities are re-probed against the running kernel on next boot
rm -f "$DATADIR/caps"

if [ "$KSU" = "true" ] || [ "$APATCH" = "true" ]; then
	rm -f "$MODPATH/action.sh"
	touch "$MODPATH/skip_mount"
	for dir in /data/adb/ap/bin /data/adb/ksu/bin; do
		[ -d "$dir" ] && {
			ui_print "- creating symlink in $dir"
			ln -sf /data/adb/modules/airgap/system/bin/airgap "$dir/airgap"
		}
	done
fi

set_perm_recursive "$MODPATH/system" 0 0 0755 0755
