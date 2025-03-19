

import { useState } from "react";
import forge from "node-forge";

export default function PFXConverter() {
  const [pfxFile, setPfxFile] = useState(null);
  const [password, setPassword] = useState("");

  const handleFileChange = (event) => {
    setPfxFile(event.target.files[0]);
  };

  const handlePasswordChange = (event) => {
    setPassword(event.target.value);
  };

  const downloadFile = (content, filename) => {
    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConvert = async () => {
    if (!pfxFile || !password) {
      alert("Please upload a .pfx file and enter the password.");
      return;
    }
    const initFileName = pfxFile.name.replace(/\.pfx$/i, "");


    const reader = new FileReader();
    reader.onload = async (event) => {
      const arrayBuffer = event.target.result;
      const p12Der = new Uint8Array(arrayBuffer);
      const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(p12Der));
      
      try {
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
        
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

        const certPem = forge.pki.certificateToPem(certBags[forge.pki.oids.certBag][0].cert);
        //const keyPem = forge.pki.privateKeyToPem(keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key);
        
        /*let chainPem = "";
        certBags[forge.pki.oids.certBag].forEach((bag) => {
          chainPem += forge.pki.certificateToPem(bag.cert) + "\n";
        });*/

        downloadFile(certPem, `cert-${initFileName}.crt`);
        //downloadFile(keyPem, `key-${initFileName}.key`);
        downloadFile(chainPem, `chain-${initFileName}.pem`);
        
        // cert
        const certBagList = certBags[forge.pki.oids.certBag];
        const mainCert = forge.pki.certificateToPem(certBagList[0].cert);
        downloadFile(mainCert, `cert-${initFileName}.crt`);

        let chainPem = "";
        for (let i = 1; i < certBagList.length; i++) {
          chainPem += forge.pki.certificateToPem(certBagList[i].cert) + "\n";
        }
        if (chainPem) {
          downloadFile(chainPem, `chain-${initFileName}.pem`);
        }



        // key
        const keyBag = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
        const key = keyBag && keyBag[0] ? keyBag[0].key : null;
        if (!key) {
          alert("Private key could not be extracted. Ensure the PFX contains an unencrypted key.");
          return;
        }
        const keyPem = forge.pki.privateKeyToPem(key);
        downloadFile(keyPem, `key-${initFileName}.key`);


      } catch (error) {
        alert("Failed to convert PFX file. Please check your password.");
      }
    };
    reader.readAsArrayBuffer(pfxFile);
  };

  return (
    <div className="p-4 max-w-md mx-auto text-center">
      <h1 className="text-xl font-bold">PFX converter</h1>
      <div class="form-container">
      <p>This tool will split a pfx file into separate certificate, private key and chain files.</p>
        <div>
          <label for="upload">Upload the PFX file for conversion: </label>
          <input id="uplaod" type="file" onChange={handleFileChange} accept=".pfx" className="block my-2" />
        </div>
        <div>
          <label for="password">Enter the certificate password: </label>
          <input id="password"type="password" value={password} onChange={handlePasswordChange} placeholder="Password" className="block my-2 p-2 border" />
        </div>
        <div class="center">
          <button onClick={handleConvert} className="bg-blue-500 text-white px-4 py-2 rounded">Convert</button>
        </div>
      </div>
    </div>
  );
}
