let fileContent = '';

document.getElementById('fileInput').addEventListener('change', function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      fileContent = e.target.result;
    };
    reader.readAsText(file);
  }
});

function processFile() {
  if (!fileContent) {
    alert('Please upload a CSV file first.');
    return;
  }

  const records = Papa.parse(fileContent, { header: true, skipEmptyLines: true }).data;
  const recordsByEmail = groupBy(records, 'StudentPreferredEmail');
  const [startOutput, stopOutput] = processRecords(recordsByEmail);

  downloadCSV(startOutput, 'start_nudge.csv');
  downloadCSV(stopOutput, 'stop_nudge.csv');
}

document.getElementById('the_form_submit').addEventListener('click', function (event) {
  processFile();
});


function groupBy(array, key) {
  return array.reduce((result, currentValue) => {
    (result[currentValue[key]] = result[currentValue[key]] || []).push(currentValue);
    return result;
  }, {});
}

/*function filterArrayByProperty(array, property, value) {
  return array.filter(item => item[property] !== value);
}*/

// Function to parse the date string in the format 'd/m/yyyy hh:mm'
function parseDateString(dateString) {
  const [datePart, timePart] = dateString.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  return new Date(year, month - 1, day, hours, minutes);
}

// Function to sort the array by ApplicationLastModifiedDateTime
function sortByDateProperty(array, property) {
  return array.sort((a, b) => {
      const dateA = parseDateString(a[property]);
      const dateB = parseDateString(b[property]);
      return dateB - dateA;
  });
}

function processRecords(recordsByEmail) {
  const startOutput = [];
  const stopOutput = [];

  const headers = Object.keys(recordsByEmail[Object.keys(recordsByEmail)[0]][0]);
  startOutput.push([...headers, 'START', 'STOP', 'MULTIPLE']);
  stopOutput.push([...headers, 'START', 'STOP', 'MULTIPLE']);

  Object.keys(recordsByEmail).forEach(email => {
    const recs = recordsByEmail[email];
    const multiple = recs.length > 1;
    let stopping = isStopping(recs) || !isStarting(recs);
    let starting = isStarting(recs) && !stopping;
    const stopFlag = stopping ? 'Y' : 'N';
    const startFlag = starting ? 'Y' : 'N';
    const multipleFlag = multiple ? 'Y' : 'N';

    recs.forEach(record => {
      // Fix mobile numbers
      if (record.StudentPreferredPhone && record.StudentPreferredPhone !== '') {
        try {
          const phoneNumber = libphonenumber.parsePhoneNumber(record.StudentPreferredPhone, 'AU');
          let formattedNumber = phoneNumber.format('E.164');
          if (formattedNumber.startsWith('+61')) {
            formattedNumber = formattedNumber.replace('+61', '61');
          }
          record.StudentPreferredPhone = formattedNumber;
        } catch (e) {
          console.log('Could not fix phone number (it might be invalid): ', record.StudentPreferredPhone);
        }
      }
    });

    // sort application records by date, so only the most recently modified application is considered 
    const sortedRecs = sortByDateProperty(recs, 'ApplicationLastModifiedDateTime');

    // get the first item in the array that is not cancelled
    const chosenRec = sortedRecs.find((record) => record.ApplicationStatusCode === 'ENTERED' && record.WorkflowStatus === 'Enter Application') || sortedRecs[0];

    // if the most recent is TOL, it will be in the stop list
    if (chosenRec.RegionCode === 'TQTOL') {
      stopping = true;
      starting = false;
    }

    if (multiple) {
      const correctedRecord = { ...chosenRec, 'Location': '', 'CourseCode': '', 'CourseVersion': '', 'CourseTitle': '', 'AttendanceMode': '', 'StudyMode': '', 'AssignedUser': '', 'ApplicationOnHold': '' };
      const recordValues = Object.values(correctedRecord).concat([startFlag, stopFlag, multipleFlag]);
      if (starting) startOutput.push(recordValues);
      if (stopping) stopOutput.push(recordValues);
    } else {
      sortedRecs.forEach(record => {
        const recordValues = Object.values(record).concat([startFlag, stopFlag, multipleFlag]);
        if (starting) startOutput.push(recordValues);
        if (stopping) stopOutput.push(recordValues);
      });
    }
  });

  return [startOutput, stopOutput];
}

function isStaffHold(records) {
  const staffHoldStatuses = ['Offered', 'Perform Assessment', 'Triage', 'Potential Duplicate'];
  return records.some(record => record.ApplicationStatusCode === 'ENTERED' && staffHoldStatuses.includes(record.WorkflowStatus));
}

function isStarting(records) {
  const staffHold = isStaffHold(records);
  const match = records.some(record =>
    
    ['Online Application', 'Staff Commenced - Student Progressed'].includes(record.SubmissionMethod) &&
    record.ApplicationStatusCode === 'ENTERED' &&
    record.WorkflowStatus === 'Enter Application' &&
    record.WorkflowStage === 'INCOMPLETE' &&
    // record.RegionCode !== 'TQTOL' && 
    /* ************************ */
    record.StuCommSuppressFg === 'N' && // NOTE: TO BE UPDATED
    /* ************************ */
    record.ApplicationOnHold !== 'Y' &&
    !staffHold
  );
  const excluded = records.some(record => record.ApplicationStatusCode === 'COMPLETE');
  return match && !excluded;
}

function isStopping(records) {
  const staffHold = isStaffHold(records);
  const starting = isStarting(records);
  return records.some(record =>
    !starting &&
    (staffHold ||
      (record.ApplicationStatusCode === 'ENTERED' && ['Cancelled', 'Withdrawn'].includes(record.WorkflowStatus)) ||
      ['CANCELLED', 'COMPLETE'].includes(record.ApplicationStatusCode))
  );
}

function downloadCSV(data, filename) {
  const csvContent = Papa.unparse(data);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}