#!/bin/bash

usage()
{
  echo "Usage: $0 [ -f <FILENAME> ] [ -c <CONTEST_ID> ]"
  exit 2
}

while getopts ":c:f:" o; do
    case "${o}" in
        c)
            CONTEST_ID=${OPTARG}
            ;;
        f)
            FILENAME=${OPTARG}
            ;;
        *)
            usage
            ;;
    esac
done
shift $((OPTIND-1))

if [ -z "${CONTEST_ID}" ] || [ -z "${FILENAME}" ]; then
    usage
fi

unset DB_PASS
stty_orig=$(stty -g)
echo "Please enter DB Password";
stty -echo
read DB_PASS
stty $stty_orig
export PGPASSWORD=$DB_PASS

psql -h localhost -U cmsuser -d cmsdb -c "START TRANSACTION;"
COUNT=0
while IFS=, read -r NAME LASTNAME USER PASS MAIL
do
    USER_ID=`psql -h localhost -U cmsuser -d cmsdb -c "INSERT INTO users(first_name,last_name,username,password,email,preferred_languages) VALUES('${NAME}','${LASTNAME}','${USER}','plaintext:${PASS}','${MAIL}','{}') returning id;" | awk 'FNR == 3 {print}'`
    psql -h localhost -U cmsuser -d cmsdb -c "INSERT INTO participations(delay_time,extra_time,hidden,unrestricted,contest_id,user_id) VALUES('00:00:00','00:00:00',false,false,${CONTEST_ID},${USER_ID});"
done < "$FILENAME"
psql -h localhost -U cmsuser -d cmsdb -c "COMMIT;"

echo "Succesfully registered ${COUNT} participants in contest ${CONTEST_ID}"
unset PGPASSWORD