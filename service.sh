#!/system/bin/sh
MODDIR=${0%/*}

until [ "$(getprop sys.boot_completed)" = "1" ] && [ -f /data/system/packages.list ]; do
	sleep 1
done

"$MODDIR/system/bin/airgap" daemon >/dev/null 2>&1 &
