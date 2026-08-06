#!/system/bin/sh
AIRGAP=/data/adb/modules/airgap/system/bin/airgap

[ -x "$AIRGAP" ] && {
	"$AIRGAP" stop
	"$AIRGAP" clear
}

rm -rf /data/adb/airgap
rm -f /data/adb/ap/bin/airgap /data/adb/ksu/bin/airgap
